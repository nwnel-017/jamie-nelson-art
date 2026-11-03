export const MAX_INSTRUCTIONS_LENGTH = 4000;

export interface PublishSettings {
  instructions: string;
}

export function isValidInstructions(instructions: string): boolean {
  return (
    instructions.trim().length > 0 &&
    instructions.length <= MAX_INSTRUCTIONS_LENGTH
  );
}

export function parsePublishSettings(
  publishRef?: string,
): PublishSettings | undefined {
  if (!publishRef) return undefined;
  try {
    const value: unknown = JSON.parse(publishRef);
    if (
      typeof value !== "object" ||
      value == null ||
      !("instructions" in value) ||
      typeof value.instructions !== "string"
    ) {
      return undefined;
    }
    return { instructions: value.instructions };
  } catch {
    return undefined;
  }
}
