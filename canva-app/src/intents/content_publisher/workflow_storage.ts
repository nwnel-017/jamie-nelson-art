import { auth } from "@canva/user";
import type { OutputType } from "@canva/intents/content";
import {
  parseDesignRequestResponse,
  type DesignRequest,
} from "./design_request";
import type { ChangeOption } from "./types";

export interface WorkflowState {
  instructions: string;
  changeOptions: ChangeOption[];
  initialSubmissionId?: string;
  analysis?: DesignRequest;
  answers?: {
    requestId: string;
    version: number;
    values: string[];
    submissionId?: string;
  };
}
const memory = new Map<string, WorkflowState>();
function claims(token: string): Record<string, unknown> {
  const part = token.split(".")[1];
  if (!part) throw new Error("Missing claims");
  return JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
}
// Publisher contexts supply design tokens in selection/export metadata. Calling
// @canva/design.getDesignToken here requires an editor role this intent lacks.
// These decoded IDs only namespace the local cache; the backend verifies tokens.
export function designIdFromToken(token?: string): string | undefined {
  try {
    const id = token ? claims(token).designId : undefined;
    return typeof id === "string" && id.length > 0 ? id : undefined;
  } catch {
    return undefined;
  }
}

export function selectedDesignId(outputType?: OutputType): string | undefined {
  for (const slot of outputType?.mediaSlots ?? []) {
    for (const selection of slot.selection ?? []) {
      for (const metadata of selection.selectionMetadata ?? []) {
        const id = designIdFromToken(metadata.designToken);
        if (id) return id;
      }
    }
  }
  return undefined;
}

export async function workflowStorageKey(
  backendHost: string,
  designId?: string,
  token?: string,
): Promise<string | undefined> {
  if (!designId) return undefined;
  try {
    const user = claims(token ?? (await auth.getCanvaUserToken()));
    if (typeof user.userId !== "string" || typeof user.brandId !== "string")
      return undefined;
    return `portfolio-workflow:v1:${JSON.stringify([backendHost.replace(/\/$/, ""), user.aud, user.brandId, user.userId, designId])}`;
  } catch {
    return undefined;
  }
}
export function loadWorkflow(key?: string): WorkflowState | undefined {
  if (!key) return undefined;
  try {
    const raw = localStorage.getItem(key);
    const state = raw ? (JSON.parse(raw) as WorkflowState) : memory.get(key);
    if (
      !state ||
      typeof state.instructions !== "string" ||
      !Array.isArray(state.changeOptions)
    )
      return undefined;
    if (state.analysis)
      state.analysis = parseDesignRequestResponse({
        designRequest: state.analysis,
      });
    if (
      state.answers &&
      (!Array.isArray(state.answers.values) ||
        !state.answers.values.every((answer) => typeof answer === "string"))
    )
      return undefined;
    return state;
  } catch {
    return memory.get(key);
  }
}
export function saveWorkflow(key: string | undefined, state: WorkflowState) {
  if (!key) return;
  memory.set(key, state);
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    /* Keep this session usable when storage is unavailable. */
  }
}
export function clearWorkflow(key?: string) {
  if (!key) return;
  memory.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {
    /* Storage may be blocked. */
  }
}
