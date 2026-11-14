/* eslint-disable no-console -- Publish diagnostics contain IDs, stages, and timing only. */
import { PublishMessages } from "./publish.messages";
import {
  DesignAnalysisError,
  parseDesignRequestResponse,
  type DesignRequest,
} from "./design_request";
import { auth } from "@canva/user";
import type {
  PublishContentRequest,
  PublishContentResponse,
} from "@canva/intents/content";
import {
  isValidInstructions,
  isValidChangeOptions,
  parsePublishSettings,
} from "./types";
import {
  loadWorkflow,
  saveWorkflow,
  workflowStorageKey,
  designIdFromToken,
} from "./workflow_storage";

function review(
  analysis: DesignRequest,
  designId?: string,
): PublishContentResponse {
  return {
    status: "app_error",
    message: analysis.ready
      ? "Your requirements are understood. Please review and approve them."
      : "Thank you for submitting. Please answer the following questions before updating your site",
    ...(!analysis.ready
      ? { localizedMessageId: PublishMessages.clarificationRequired.id }
      : {}),
    appDefinedPayload: JSON.stringify({
      type: "design_analysis",
      designRequest: analysis,
      ...(designId ? { designId } : {}),
    }),
  };
}
export async function publishToPortfolio(
  request: PublishContentRequest,
  backendHost: string,
): Promise<PublishContentResponse> {
  const settings = parsePublishSettings(request.publishRef);
  if (!settings || !isValidInstructions(settings.instructions))
    return {
      status: "app_error",
      message: "Valid AI instructions are required.",
    };
  if (!isValidChangeOptions(settings.changeOptions))
    return {
      status: "app_error",
      message: "Select one or more valid change options.",
    };
  if (settings.approvedRequestId)
    return { status: "completed", externalId: settings.approvedRequestId };
  let token: Awaited<ReturnType<typeof auth.getCanvaUserToken>>;
  try {
    token = await auth.getCanvaUserToken();
  } catch {
    return {
      status: "app_error",
      message: "Could not authenticate with Canva. Please try again.",
    };
  }
  const exportedToken = request.outputMedia
    .flatMap((media) => media.files)
    .find((file) => file.contentMetadata?.type === "design")
    ?.contentMetadata.designToken;
  const designId = designIdFromToken(exportedToken) ?? settings.designId;
  const key = await workflowStorageKey(backendHost, designId, token);
  const stored = loadWorkflow(key);
  if (stored?.analysis) return review(stored.analysis, designId);
  if (settings.designRequestId)
    return {
      status: "app_error",
      message:
        "The saved analysis is unavailable. Start a new request in the settings panel.",
    };
  if (!request.outputMedia.some((media) => media.files.length > 0))
    return { status: "app_error", message: "Select a design page to send." };
  const initialSubmissionId =
    stored?.instructions === settings.instructions &&
    JSON.stringify(stored.changeOptions) ===
      JSON.stringify(settings.changeOptions)
      ? (stored.initialSubmissionId ?? crypto.randomUUID())
      : crypto.randomUUID();
  const state = {
    instructions: settings.instructions,
    changeOptions: settings.changeOptions,
    initialSubmissionId,
  };
  saveWorkflow(key, state);
  const started = Date.now();
  let stage = "request";
  console.info("[canva-publisher] publish.started", { submissionId: initialSubmissionId });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch(
      `${backendHost.replace(/\/$/, "")}/api/agent/gather-requirements`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          submission_id: initialSubmissionId,
          source: "canva",
          instructions: settings.instructions.trim(),
          changeOptions: settings.changeOptions,
          outputMedia: request.outputMedia,
        }),
        signal: controller.signal,
      },
    );
    console.info("[canva-publisher] publish.response", { submissionId: initialSubmissionId, status: response.status, elapsedMs: Date.now() - started });
    stage = "response-body";
    if (!response.ok) {
      let message = "Portfolio request failed.";
      try {
        const error = await response.json();
        if (typeof error.statusMessage === "string")
          message = error.statusMessage;
        if (error.data?.code === "ANALYSIS_FAILED")
          saveWorkflow(key, { ...state, initialSubmissionId: undefined });
      } catch {
        /* Use fallback for network/proxy errors. */
      }
      return { status: "app_error", message, httpCode: response.status };
    }
    const analysis = parseDesignRequestResponse(await response.json());
    console.info("[canva-publisher] publish.completed", { submissionId: initialSubmissionId, requestId: analysis.id, elapsedMs: Date.now() - started });
    saveWorkflow(key, { ...state, analysis });
    return review(analysis, designId);
  } catch (error) {
    console.error("[canva-publisher] publish.failed", { submissionId: initialSubmissionId, stage, timedOut: controller.signal.aborted, errorType: error instanceof Error ? error.name : "UnknownError", elapsedMs: Date.now() - started });
    return {
      status: "app_error",
      message:
        error instanceof DesignAnalysisError
          ? error.message
          : "Could not reach the portfolio. Please try again.",
    };
  } finally {
    clearTimeout(timeout);
  }
}
