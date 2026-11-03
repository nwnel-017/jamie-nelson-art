import { z } from "zod";
import { HandoffError } from "./errors";

const items = z.array(z.string().trim().min(1).max(4000)).max(100);
export const verificationResultSchema = z
  .object({
    requirements: items,
    ambiguities: items,
    clarifying_questions: items,
  })
  .strict();

export type VerificationResult = z.infer<typeof verificationResultSchema>;
export type DesignRequestInput = VerificationResult & {
  design_image: string;
  instructions: string;
};
export type DesignRequest = DesignRequestInput & {
  id: string;
  created_at: string;
  updated_at: string;
};
export type SaveDesignRequest = (
  input: DesignRequestInput,
) => Promise<DesignRequest>;

export function parseVerificationResult(text: string): VerificationResult {
  try {
    if (text.length > 64 * 1024) throw new Error();
    return verificationResultSchema.parse(JSON.parse(text));
  } catch {
    throw new HandoffError(
      502,
      "The model returned an invalid design verification.",
    );
  }
}
