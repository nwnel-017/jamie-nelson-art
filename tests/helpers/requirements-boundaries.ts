import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import type { Database } from "../../types/supabase/database";
import type { DraftAnalysis } from "../../server/utils/agent/design-request";
export { validatePng } from "../../server/utils/agent/handoff/image";

const url = process.env.SUPABASE_URL;
if (
  !url ||
  !process.env.SUPABASE_SERVICE_ROLE_KEY ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname)
)
  throw new Error(
    "Requirements browser tests require local SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
  );

export const owner = `requirements-e2e-${randomUUID()}`;
export const client = createClient<Database>(
  url,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);
let responses: Array<DraftAnalysis | Error> = [];
export function setResponses(values: Array<DraftAnalysis | Error>) {
  responses = [...values];
}
export const serverSupabaseServiceRole = () => client;
export const createVerificationModel = () => ({
  generate: async () => {
    const response = responses.shift();
    if (!response) throw new Error("Unexpected model call");
    if (response instanceof Error) throw response;
    return { text: JSON.stringify(response) };
  },
});
export const downloadImage = async () =>
  sharp({
    create: { width: 2, height: 3, channels: 4, background: "blue" },
  })
    .png()
    .toBuffer();
