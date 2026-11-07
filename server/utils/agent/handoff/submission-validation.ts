import { z } from "zod";
import { HandoffError } from "../errors";
import { parseHandoff, validateInstructions } from "./validation";
import { verifyDesign, type CanvaVerifiers } from "./canva";
import { downloadImage, validatePng } from "./image";
import type { DesignDraft, DraftAnswer } from "./design-request";

interface HandoffValidationDependencies {
  verifiers?: CanvaVerifiers;
  download?: typeof downloadImage;
}

export async function validateAgentHandoff(
  body: unknown,
  appId: string,
  exportHosts: string[],
  dependencies: HandoffValidationDependencies = {},
) {
  const handoff = parseHandoff(body); // validates instructions
  const { file } = handoff;
  await verifyDesign(
    file.contentMetadata.designToken,
    appId,
    dependencies.verifiers,
  );
  const bytes = await (dependencies.download ?? downloadImage)(
    file.url,
    exportHosts,
  );
  await validatePng(bytes, file);
  return {
    instructions: handoff.instructions,
    changeOptions: handoff.changeOptions,
    file,
    bytes,
  };
}

export async function validateGatherRequirements(
  body: unknown,
  config: { canvaAppId: string; canvaExportHosts: string },
  dependencies: HandoffValidationDependencies = {},
) {
  const result = z
    .object({ submission_id: z.uuid() })
    .passthrough()
    .safeParse(body);
  if (!result.success)
    throw new HandoffError(400, "A valid submission ID is required.");
  const { submission_id, ...payload } = result.data;
  const hosts = config.canvaExportHosts
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  const handoff = await validateAgentHandoff(
    payload,
    config.canvaAppId,
    hosts,
    dependencies,
  );
  return { ...handoff, submissionId: submission_id };
}

export type ValidatedHandoff = Awaited<ReturnType<typeof validateAgentHandoff>>;

const clarificationSubmissionSchema = z
  .object({
    draft_version: z.number().int().positive(),
    submission_id: z.uuid(),
    answers: z
      .array(
        z
          .object({
            question_id: z.uuid(),
            answer: z.string().min(1).max(4000),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();

type ClarificationSubmission = z.infer<typeof clarificationSubmissionSchema>;

export function parseClarificationSubmission(
  body: unknown,
): ClarificationSubmission {
  const result = clarificationSubmissionSchema.safeParse(body);
  if (!result.success) {
    throw new HandoffError(
      422,
      "Provide the draft version, submission ID, and a valid answer for every question.",
      "INVALID_ANSWERS",
    );
  }
  return result.data;
}

export function validateClarificationAnswers(
  submittedAnswers: ClarificationSubmission["answers"],
  draft: DesignDraft,
): DraftAnswer[] {
  const answersById = new Map(
    submittedAnswers.map(({ question_id, answer }) => [
      question_id,
      validateInstructions(answer),
    ]),
  );
  const questions = draft.clarifying_questions;
  if (
    answersById.size !== submittedAnswers.length ||
    answersById.size !== questions.length ||
    questions.some((question) => !answersById.has(question.id))
  ) {
    throw new HandoffError(
      422,
      "Answer every question in this draft exactly once.",
      "INVALID_ANSWERS",
    );
  }
  // Preserve draft order so equivalent submissions produce the same retry hash.
  return questions.map(({ id, question }) => ({
    question_id: id,
    question,
    answer: answersById.get(id)!,
  }));
}
