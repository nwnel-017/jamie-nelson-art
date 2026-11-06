import { getRouterParam, type H3Event } from "h3";
import { z } from "zod";
import { HandoffError } from "./errors";

export function requireDesignRequestId(event: H3Event): string {
  const result = z.uuid().safeParse(getRouterParam(event, "id"));
  if (!result.success)
    throw new HandoffError(400, "Invalid design request ID.");
  return result.data;
}
