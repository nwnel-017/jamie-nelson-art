import { getHeader, setHeader, type H3Event } from "h3";
import { HandoffError } from "./errors";
import { MAX_BODY_BYTES } from "./validation";

export async function readAgentBody(
  event: H3Event,
  maxBytes = MAX_BODY_BYTES,
  sizeMessage = "Handoff payload exceeds 64 KB.",
): Promise<unknown> {
  if (
    getHeader(event, "content-type")?.split(";")[0]?.trim().toLowerCase() !==
    "application/json"
  )
    throw new HandoffError(415, "Content-Type must be application/json.");
  const length = getHeader(event, "content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes))
    throw new HandoffError(413, sizeMessage);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of event.node.req.iterator({
    destroyOnReturn: false,
  })) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > maxBytes) {
      setHeader(event, "connection", "close");
      event.node.req.resume();
      throw new HandoffError(413, sizeMessage);
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
  return body;
}
