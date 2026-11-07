// TO DO --> agent/ has too many files. Lets group these by subfolders
import { z } from "zod";
import { HandoffError } from "../errors";

export const MAX_BODY_BYTES = 64 * 1024;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 25_000_000;
export const MAX_IMAGE_DIMENSION = 10_000;

const changeOption = z.enum(["existing_pages", "new_pages", "website_theme"]);
export type ChangeOption = z.infer<typeof changeOption>;
const changeOptions = z
  .array(changeOption)
  .min(1)
  .max(3)
  .refine((values) => new Set(values).size === values.length);

const page = z
  .object({
    pageId: z.string().min(1).max(256).optional(),
    pageNumber: z.number().int().positive(),
  })
  .strict();
const image = z
  .object({
    format: z.literal("png"),
    url: z.string().url().max(8192),
    widthPx: z.number().int().positive().max(MAX_IMAGE_DIMENSION),
    heightPx: z.number().int().positive().max(MAX_IMAGE_DIMENSION),
    contentMetadata: z
      .object({
        type: z.literal("design"),
        designToken: z.string().min(1).max(16384),
        title: z.string().max(1000).optional(),
        pages: z.array(page).length(1),
      })
      .strict(),
  })
  .strict();
const schema = z
  .object({
    source: z.literal("canva"),
    changeOptions,
    instructions: z.string().min(1).max(4000),
    outputMedia: z
      .array(
        z
          .object({
            mediaSlotId: z.literal("media"),
            files: z.array(image).length(1),
          })
          .strict(),
      )
      .length(1),
  })
  .strict();

// Defense in depth only. Do not turn accepted text, image text or metadata into
// system/developer instructions, executable code, or authorization decisions.
export function validateInstructions(value: string): string {
  const instructions = value.trim();
  if (
    !instructions ||
    value.length > 4000 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u.test(
      value,
    )
  ) {
    throw new HandoffError(
      422,
      "Instructions must be plain text between 1 and 4000 characters.",
    );
  }
  const text = instructions.normalize("NFKC");
  const blocked = [
    /\b(ignore|disregard|override|bypass)\b[\s\S]{0,80}\b(previous|system|developer|security|safety|instructions|rules|polic(?:y|ies))\b/i,
    /\b(reveal|show|print|leak|send|extract|exfiltrate)\b[\s\S]{0,80}\b(secrets?|passwords?|api[ _-]?keys?|access[ _-]?tokens?|system[ _-]?prompt|environment[ _-]?variables?)\b/i,
    /\b(execute|run)\b[\s\S]{0,40}\b(shell|bash|powershell|terminal|commands?|scripts?|arbitrary code)\b/i,
    /(?:<\/?(?:system|developer|assistant|tool)>|\[INST\]|<\|(?:im_start|im_end|system|assistant|developer)\|>)/i,
    /\b(?:you are now|act as|pretend to be)\b[\s\S]{0,50}\b(?:system|developer|unrestricted|administrator|admin)\b/i,
  ];
  if (blocked.some((pattern) => pattern.test(text))) {
    throw new HandoffError(
      422,
      "Instructions contain a disallowed agent-control request.",
    );
  }
  return instructions;
}

// TO DO - review how images are being validated
export function parseHandoff(value: unknown) {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new HandoffError(400, "Invalid Canva handoff payload.");
  const instructions = validateInstructions(result.data.instructions);
  const file = result.data.outputMedia[0]!.files[0]!;
  if (file.widthPx * file.heightPx > MAX_IMAGE_PIXELS) {
    throw new HandoffError(413, "Image exceeds the pixel limit.");
  }
  return { instructions, changeOptions: result.data.changeOptions, file };
}
export type HandoffImage = ReturnType<typeof parseHandoff>["file"];
