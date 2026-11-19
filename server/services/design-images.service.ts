import type { DesignImage } from "@server/utils/agent/design-request";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "#types/supabase/database";
import { validatePng } from "@server/utils/agent/handoff/image";
import { HandoffError } from "@server/utils/agent/errors";
import {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_PIXELS,
} from "@server/utils/agent/handoff/validation";
import { getDesignRequest } from "./design-requests.service";
import { getDesignDraft } from "./design-drafts.service";

type Client = SupabaseClient<Database>;
const uploadSchema = z
  .object({
    draft_version: z.coerce.number().int().positive(),
    question_id: z.uuid(),
    filename: z.string().trim().min(1).max(255),
  })
  .strict();

export async function uploadClarificationImage(
  supabase: Client,
  requestId: string,
  userId: string,
  input: unknown,
  bytes: Uint8Array,
): Promise<DesignImage> {
  const parsed = uploadSchema.safeParse(input);
  if (!parsed.success)
    throw new HandoffError(
      422,
      "Provide the draft version, image question, and filename.",
    );
  const { draft_version, question_id, filename } = parsed.data;
  await getDesignRequest(supabase, requestId, userId);
  const draft = await getDesignDraft(supabase, requestId);
  if (!draft || draft.version !== draft_version || draft.ready)
    throw new HandoffError(
      409,
      "This draft has changed. Refresh before uploading.",
      "STALE_DRAFT",
    );
  if (
    !draft.clarifying_questions.some(
      (q) => q.id === question_id && q.type === "image",
    )
  )
    throw new HandoffError(
      422,
      "Upload an image only for an image question in this draft.",
    );
  if (bytes.byteLength > MAX_IMAGE_BYTES)
    throw new HandoffError(
      413,
      "Image exceeds the 5 MB limit. Please upload a smaller image.",
    );
  let format: "png" | "jpeg" | "webp";
  try {
    const buffer = Buffer.from(bytes);
    if (
      buffer
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      buffer.length >= 24
    ) {
      await validatePng(buffer, {
        widthPx: buffer.readUInt32BE(16),
        heightPx: buffer.readUInt32BE(20),
      });
      format = "png";
    } else {
      const image = sharp(bytes, {
        failOn: "warning",
        limitInputPixels: MAX_IMAGE_PIXELS,
      });
      const metadata = await image.metadata();
      if (
        metadata.format !== "png" &&
        metadata.format !== "jpeg" &&
        metadata.format !== "webp"
      )
        throw new HandoffError(415, "Upload a PNG, JPEG, or WebP image.");
      if (
        !metadata.width ||
        !metadata.height ||
        metadata.width > MAX_IMAGE_DIMENSION ||
        metadata.height > MAX_IMAGE_DIMENSION ||
        (metadata.pages ?? 1) !== 1
      )
        throw new HandoffError(
          422,
          "Image dimensions or animation are not supported.",
        );
      await image.raw().toBuffer();
      format = metadata.format;
    }
  } catch (error) {
    if (error instanceof HandoffError) throw error;
    throw new HandoffError(
      422,
      "The image is invalid or exceeds decoding limits. Upload a valid PNG, JPEG, or WebP image.",
    );
  }
  const id = randomUUID();
  const path = `${requestId}/${id}.${format}`;
  const bucket = supabase.storage.from("design_images");
  const { error: uploadError } = await bucket.upload(path, bytes, {
    contentType: `image/${format}`,
    upsert: false,
  });
  if (uploadError)
    throw new HandoffError(
      502,
      "Could not upload the image. Please try again.",
    );
  const { error } = await supabase
    .from("design_images")
    .insert({
      id,
      design_request_id: requestId,
      question_id,
      filename,
      storage_path: path,
      mime_type: `image/${format}`,
    });
  if (error)
    throw new HandoffError(
      500,
      "Could not save the image answer. Please try again.",
    );
  return {
    id,
    question_id,
    filename,
    url: bucket.getPublicUrl(path).data.publicUrl,
  };
}

export async function getClarificationImage(
  supabase: Client,
  requestId: string,
  imageId: string,
): Promise<DesignImage> {
  const { data, error } = await supabase
    .from("design_images")
    .select("id, question_id, filename, storage_path")
    .eq("design_request_id", requestId)
    .eq("id", imageId)
    .maybeSingle();
  if (error) throw new HandoffError(500, "Could not load the image answer.");
  if (!data)
    throw new HandoffError(
      422,
      "Upload a valid image for this request.",
      "INVALID_ANSWERS",
    );
  return {
    id: data.id,
    question_id: data.question_id,
    filename: data.filename,
    url: supabase.storage.from("design_images").getPublicUrl(data.storage_path)
      .data.publicUrl,
  };
}
