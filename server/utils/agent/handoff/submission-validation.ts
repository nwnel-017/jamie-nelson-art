import { z } from "zod";
import { HandoffError } from "../errors";
import { parseHandoff, validateInstructions } from "./validation";
import { verifyDesign, type CanvaVerifiers } from "../canva";
import { downloadImage, validatePng } from "./image";
import type { DesignDraft, DraftAnswer } from "../design-request";

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
            answer: z.string().max(4000).default(""),
            image_id: z.uuid().optional(),
            keep_anyway: z.boolean().optional(),
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
    submittedAnswers.map((answer) => [answer.question_id, answer]),
  );
  const questions = draft.clarifying_questions;
  if (
    answersById.size !== submittedAnswers.length ||
    answersById.size !== questions.length ||
    questions.some((q) => !answersById.has(q.id))
  )
    throw new HandoffError(
      422,
      "Answer every question in this draft exactly once.",
      "INVALID_ANSWERS",
    );
  return questions.map(({ id, question, type, image_id, concern }) => {
    const submitted = answersById.get(id)!;
    if (type === "image") {
      if (!submitted.image_id)
        throw new HandoffError(
          422,
          "Upload an image for every image question.",
          "INVALID_ANSWERS",
        );
      if (
        (submitted.keep_anyway &&
          (!concern || submitted.image_id !== image_id)) ||
        (image_id === submitted.image_id && !submitted.keep_anyway)
      )
        throw new HandoffError(
          422,
          "Keep this image explicitly or upload a replacement.",
          "INVALID_ANSWERS",
        );
      return {
        ...submitted,
        question,
        ...(concern ? { concern } : {}),
        answer: submitted.answer.trim()
          ? validateInstructions(submitted.answer)
          : "",
      };
    }
    if (submitted.image_id || submitted.keep_anyway)
      throw new HandoffError(
        422,
        "Only image questions accept images.",
        "INVALID_ANSWERS",
      );
    return {
      question_id: id,
      question,
      answer: validateInstructions(submitted.answer),
    };
  });
}
