import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "#types/supabase/database";
import { HandoffError } from "@server/utils/agent/errors";

export const WEBSITE_DESIGNS_BUCKET = "website_designs";

export async function uploadDesignImage(
  supabase: SupabaseClient<Database>,
  bytes: Uint8Array,
): Promise<{ path: string; url: string }> {
  const bucket = supabase.storage.from(WEBSITE_DESIGNS_BUCKET);
  const path = `${randomUUID()}.png`;
  try {
    const { data, error } = await bucket.upload(path, bytes, {
      contentType: "image/png",
      upsert: false,
    });
    if (error || !data) {
      throw new Error("Design image upload failed.");
    }
    return {
      path: data.path,
      url: bucket.getPublicUrl(data.path).data.publicUrl,
    };
  } catch {
    throw new HandoffError(
      502,
      "Could not upload the design image. Please try again.",
    );
  }
}

export async function deleteDesignImage(
  supabase: SupabaseClient<Database>,
  path: string,
): Promise<void> {
  const { error } = await supabase.storage
    .from(WEBSITE_DESIGNS_BUCKET)
    .remove([path]);
  if (error) {
    throw new HandoffError(502, "Could not remove the design image.");
  }
}
