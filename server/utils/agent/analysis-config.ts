// TO DO - verify if this is unnecesary and should be removed
import { HandoffError } from "./errors";

export const DEFAULT_ANALYSIS_LIMIT = 4;

export function analysisLimit(value: unknown = DEFAULT_ANALYSIS_LIMIT): number {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new HandoffError(
      503,
      "NUXT_MAX_ANALYZE_ATTEMPTS must be an integer from 1 to 100.",
    );
  }
  return limit;
}
