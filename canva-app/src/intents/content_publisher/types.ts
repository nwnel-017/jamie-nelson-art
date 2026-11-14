import { isRequestId } from "./design_request";
export const MAX_INSTRUCTIONS_LENGTH = 4000;

export const CHANGE_OPTIONS = [
  "existing_pages",
  "new_pages",
  "website_theme",
] as const;
export type ChangeOption = (typeof CHANGE_OPTIONS)[number];

export function isChangeOption(value: unknown): value is ChangeOption {
  return (
    typeof value === "string" &&
    CHANGE_OPTIONS.some((option) => option === value)
  );
}

export function isValidChangeOptions(value: unknown): value is ChangeOption[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= CHANGE_OPTIONS.length &&
    value.every(isChangeOption) &&
    new Set(value).size === value.length
  );
}

export interface PublishSettings {
  changeOptions: ChangeOption[];
  instructions: string;
  designRequestId?: string;
  designId?: string;
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
    const changeOptions =
      "changeOptions" in value && isValidChangeOptions(value.changeOptions)
        ? value.changeOptions
        : [];
    const designRequestId =
      "designRequestId" in value ? value.designRequestId : undefined;
    if (designRequestId !== undefined && !isRequestId(designRequestId))
      return undefined;
    const designId = "designId" in value ? value.designId : undefined;
    if (
      designId !== undefined &&
      (typeof designId !== "string" || !designId || designId.length > 256)
    )
      return undefined;
    return {
      ...(designId ? { designId } : {}),
      instructions: value.instructions,
      changeOptions,
      ...(designRequestId ? { designRequestId } : {}),
    };
  } catch {
    return undefined;
  }
}
