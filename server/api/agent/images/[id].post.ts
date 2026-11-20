import { serverSupabaseServiceRole } from "#supabase/server";
import type { Database } from "#types/supabase/database";
import { requireCanvaUser } from "@server/utils/auth/requireCanvaUser";
import { requireDesignRequestId } from "@server/utils/agent/request-id";
import { agentRequestError, HandoffError } from "@server/utils/agent/errors";
import { MAX_IMAGE_BYTES } from "@server/utils/agent/handoff/validation";
import { uploadClarificationImage } from "@server/services/design-images.service";

export default defineEventHandler(async (event) => {
  setHeader(event, "cache-control", "no-store");
  try {
    const user = await requireCanvaUser(event, useRuntimeConfig(event));
    const id = requireDesignRequestId(event);
    const message =
      "Image exceeds the 5 MB limit. Please upload a smaller image.";
    const length = getHeader(event, "content-length");
    if (length && (!/^\d+$/.test(length) || Number(length) > MAX_IMAGE_BYTES))
      throw new HandoffError(413, message);
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of event.node.req.iterator({
      destroyOnReturn: false,
    })) {
      size += chunk.length;
      if (size > MAX_IMAGE_BYTES) {
        setHeader(event, "connection", "close");
        event.node.req.resume();
        throw new HandoffError(413, message);
      }
      chunks.push(Buffer.from(chunk));
    }
    const image = await uploadClarificationImage(
      serverSupabaseServiceRole<Database>(event),
      id,
      user.userId,
      getQuery(event),
      Buffer.concat(chunks, size),
    );
    return { image };
  } catch (error) {
    throw agentRequestError(error);
  }
});
