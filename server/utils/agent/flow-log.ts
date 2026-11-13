import { randomUUID } from "node:crypto";
import { HandoffError } from "./errors";

/** Log only operational metadata; never serialize payloads, tokens or raw errors. */
export function createFlowLog(flow: string) {
  const traceId = randomUUID();
  const started = Date.now();
  const write = (event: string, metadata: Record<string, unknown> = {}) => {
    console.info(
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
        console.error(
          JSON.stringify({
            feature: "canva-publisher",
            flow,
            traceId,
            event: "stage.failed",
            stage,
            durationMs: Date.now() - start,
            ...safeError(error),
          }),
        );
        throw error;
      }
    },
    fail(error: unknown) {
      console.error(
        JSON.stringify({
          feature: "canva-publisher",
          flow,
          traceId,
          event: "failed",
          elapsedMs: Date.now() - started,
          ...safeError(error),
        }),
      );
    },
  };
}

function safeError(error: unknown) {
  return error instanceof HandoffError
    ? { statusCode: error.statusCode, code: error.code, message: error.message }
    : { errorType: error instanceof Error ? error.name : "UnknownError" };
}
