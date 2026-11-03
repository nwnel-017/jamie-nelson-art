import { auth } from "@canva/user";
import type {
  PublishContentRequest,
  PublishContentResponse,
} from "@canva/intents/content";
import { isValidInstructions, parsePublishSettings } from "./types";

export async function publishToPortfolio(
  request: PublishContentRequest,
  backendHost: string,
): Promise<PublishContentResponse> {
  const settings = parsePublishSettings(request.publishRef);
  if (!settings || !isValidInstructions(settings.instructions)) {
    return {
      status: "app_error",
      message: "Valid AI instructions are required.",
    };
  }
  if (!request.outputMedia.some((media) => media.files.length > 0)) {
    return { status: "app_error", message: "Select a design page to send." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const token = await auth.getCanvaUserToken();
    const response = await fetch(
      `${backendHost.replace(/\/$/, "")}/api/agent-handoff`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          source: "canva",
          instructions: settings.instructions.trim(),
          outputMedia: request.outputMedia,
        }),
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      return {
        status: "app_error",
        message: "Portfolio handoff failed.",
        httpCode: response.status,
      };
    }
    const result: unknown = await response.json();
    if (
      typeof result !== "object" ||
      result == null ||
      !("message" in result) ||
      result.message !== "success"
    ) {
      return {
        status: "app_error",
        message: "Portfolio did not confirm the handoff.",
      };
    }
    return { status: "completed" };
  } catch {
    return {
      status: "app_error",
      message: "Could not reach the portfolio. Please try again.",
    };
  } finally {
    clearTimeout(timeout);
  }
}
