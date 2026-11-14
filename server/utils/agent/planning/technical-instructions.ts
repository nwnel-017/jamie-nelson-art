import { z } from "zod";
import { HandoffError } from "../errors";

const text = z.string().min(1).max(4000).refine((value) => Boolean(value.trim()));
const list = z.array(text).max(100);
const file = z
  .string()
  .min(1)
  .max(500)
  .refine(
    (path) =>
      !path.startsWith("/") &&
      !/^[a-z]:/i.test(path) &&
      !path.includes("\\") &&
      !path.includes("\0") &&
      !path.split("/").some((part) => !part || part === ".." || part === "."),
  );

export const technicalInstructionsSchema = z
  .object({
    objective: text,
    tasks: z
      .array(
        z
          .object({
            id: z.string().min(1).max(80),
            description: text,
            files: z.array(file).max(50),
            acceptance_criteria: list.min(1),
          })
          .strict(),
      )
      .max(100),
    verification_steps: list,
    constraints: list,
    blockers: list,
  })
  .strict();

export type TechnicalInstructions = z.infer<typeof technicalInstructionsSchema>;
export function parseTechnicalInstructions(
  value: unknown,
): TechnicalInstructions {
  const result = technicalInstructionsSchema.safeParse(value);
  if (
    !result.success ||
    (!result.data.tasks.length && !result.data.blockers.length) ||
    new Set(result.data.tasks.map((task) => task.id)).size !== result.data.tasks.length ||
    Buffer.byteLength(JSON.stringify(result.data)) > 128 * 1024
  ) {
    throw new HandoffError(
      422,
      "Codex returned invalid technical instructions.",
      "INVALID_TECHNICAL_INSTRUCTIONS",
    );
  }
  return result.data;
}
