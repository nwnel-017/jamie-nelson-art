import { randomUUID } from "node:crypto";
import { HandoffError } from "./errors";

/** Log only operational metadata; never serialize payloads, tokens or raw errors. */
export function createFlowLog(flow: string) {
  const traceId = randomUUID();
  const started = Date.now();
  const write = (
    event: string,
    metadata: Record<string, unknown> = {},
    level: "info" | "error" = "info",
  ) => {
    console[level](
      JSON.stringify({
        feature: "canva-publisher",
        flow,
        traceId,
        event,
        elapsedMs: Date.now() - started,
        ...metadata,
      }),
    );
  };
  write("started");
  return {
    traceId,
    write,
    async step<T>(stage: string, action: () => Promise<T>): Promise<T> {
      const start = Date.now();
      write("stage.started", { stage });
      try {
        const result = await action();
        write("stage.completed", { stage, durationMs: Date.now() - start });
        return result;
      } catch (error) {
        write(
          "stage.failed",
          {
            stage,
            durationMs: Date.now() - start,
            ...safeError(error),
          },
          "error",
        );
        throw error;
      }
    },
    fail(error: unknown) {
      write("failed", safeError(error), "error");
    },
  };
}

function safeError(error: unknown) {
  return error instanceof HandoffError
    ? { statusCode: error.statusCode, code: error.code, message: error.message }
    : { errorType: error instanceof Error ? error.name : "UnknownError" };
}
