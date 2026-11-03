import {
  createError,
  defineEventHandler,
  getHeader,
  setHeader,
  type H3Event,
} from "h3";
import { authorizeCanvaUser, bearerToken } from "./canva";
import { HandoffError } from "./errors";
import { MAX_BODY_BYTES } from "./validation";
import {
  generateDesignRequest,
  validateAgentHandoff,
} from "../../services/agent-handoff.service";

interface HandoffConfig {
  canvaAppId: string;
  canvaAllowedUserIds: string;
  canvaExportHosts: string;
}
export function createAgentHandoffHandler(
  getConfig: (event: H3Event) => HandoffConfig,
  dependencies = {
    authorize: authorizeCanvaUser,
    validate: validateAgentHandoff,
    process: (
      handoff: Awaited<ReturnType<typeof validateAgentHandoff>>,
      _event: H3Event,
    ) => generateDesignRequest(handoff),
  },
) {
  return defineEventHandler(async (event) => {
    try {
      const config = getConfig(event);
      const token = bearerToken(getHeader(event, "authorization"));
      await dependencies.authorize(
        token,
        config.canvaAppId,
        config.canvaAllowedUserIds
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean),
      );
      if (
        getHeader(event, "content-type")
          ?.split(";")[0]
          ?.trim()
          .toLowerCase() !== "application/json"
      )
        throw new HandoffError(415, "Content-Type must be application/json.");
      const length = getHeader(event, "content-length");
      if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES))
        throw new HandoffError(413, "Handoff payload exceeds 64 KB.");
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of event.node.req.iterator({
        destroyOnReturn: false,
      })) {
        const bytes = Buffer.from(chunk);
        size += bytes.length;
        if (size > MAX_BODY_BYTES) {
          setHeader(event, "connection", "close");
          event.node.req.resume();
          throw new HandoffError(413, "Handoff payload exceeds 64 KB.");
        }
        chunks.push(bytes);
      }
      let body: unknown;
      try {
        body = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(
            Buffer.concat(chunks, size),
          ),
        );
      } catch {
        throw new HandoffError(400, "Invalid JSON body.");
      }
      const handoff = await dependencies.validate(
        body,
        config.canvaAppId,
        config.canvaExportHosts
          .split(",")
          .map((host) => host.trim().toLowerCase())
          .filter(Boolean),
      );
      const designRequest = await dependencies.process(handoff, event);
      return { message: "success", designRequest };
    } catch (error) {
      if (error instanceof HandoffError)
        throw createError({
          statusCode: error.statusCode,
          statusMessage: error.message,
        });
      throw createError({
        statusCode: 500,
        statusMessage: "Could not process the Canva handoff.",
      });
    }
  });
}
