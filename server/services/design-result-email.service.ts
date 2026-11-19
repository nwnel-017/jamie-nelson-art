import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "#types/supabase/database";
import { HandoffError } from "@server/utils/agent/errors";

export const resultEmailSchema = z
  .object({
    outcome: z.enum(["ready", "failure"]),
    message: z
      .object({
        from: z
          .string()
          .min(1)
          .max(320)
          .regex(/^[^\r\n]+$/),
        to: z.array(z.email()).length(1),
        subject: z.string().min(1).max(500),
        text: z.string().min(1).max(10000),
        html: z.string().min(1).max(20000),
      })
      .strict(),
  })
  .strict();

type Client = SupabaseClient<Database>;

export async function getResultEmail(client: Client, jobId: string) {
  const { data, error } = await client
    .from("technical_design_jobs")
    .select("result_email, email_sent_at")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw new HandoffError(500, "Could not read the result email.");
  if (!data) throw new HandoffError(404, "Technical job not found.");
  return data;
}

export async function saveResultEmail(
  client: Client,
  jobId: string,
  input: unknown,
) {
  const email = resultEmailSchema.parse(input);
  // The first terminal outcome wins, even when two completion events arrive together.
  const { error } = await client
    .from("technical_design_jobs")
    .update({ result_email: email })
    .eq("id", jobId)
    .is("result_email", null);
  if (error) throw new HandoffError(500, "Could not save the result email.");
  return getResultEmail(client, jobId);
}

export async function markResultEmailSent(client: Client, jobId: string) {
  const { error } = await client
    .from("technical_design_jobs")
    .update({ email_sent_at: new Date().toISOString() })
    .eq("id", jobId)
    .not("result_email", "is", null)
    .is("email_sent_at", null);
  if (error) throw new HandoffError(500, "Could not record email delivery.");
  const state = await getResultEmail(client, jobId);
  if (!state.result_email)
    throw new HandoffError(
      409,
      "Save the result email before marking it sent.",
    );
  return state;
}
