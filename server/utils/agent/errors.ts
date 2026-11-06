import { createError } from "h3";

export class HandoffError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "HandoffError";
  }
}

export function agentRequestError(
  error: unknown,
  message = "Could not process the design request.",
) {
  if (error instanceof HandoffError) {
    return createError({
      statusCode: error.statusCode,
      statusMessage: error.message,
      data: error.code ? { code: error.code } : undefined,
    });
  }
  return createError({ statusCode: 500, statusMessage: message });
}
