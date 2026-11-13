import {
  initDesignTokenVerifier,
  initUserTokenVerifier,
  TokenExpiredError,
  TokenInvalidError,
} from "@canva/app-middleware";
import { HandoffError } from "./errors";

export interface CanvaVerifiers {
  user: {
    verify(
      token: string,
    ): Promise<{ appId: string; userId: string; brandId: string }>;
  };
  design: {
    verify(token: string): Promise<{ appId: string; designId: string }>;
  };
}
const cache = new Map<string, CanvaVerifiers>();
export function getCanvaVerifiers(appId: string): CanvaVerifiers {
  let verifiers = cache.get(appId);
  if (!verifiers) {
    const options = { appId, timeoutMs: 10000 };
    verifiers = {
      user: initUserTokenVerifier(options),
      design: initDesignTokenVerifier(options),
    };
    cache.set(appId, verifiers);
  }
  return verifiers;
}

export function bearerToken(header?: string): string {
  const match = header?.match(
    /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i,
  );
  if (!match || match[1]!.length > 16384)
    throw new HandoffError(401, "A valid Canva user token is required.");
  return match[1]!;
}

export async function authorizeCanvaUser(
  token: string,
  appId: string,
  allowedUserIds: string[],
  verifiers = getCanvaVerifiers(appId),
  allowUnlistedLocalUser = false,
) {
  if (!appId)
    throw new HandoffError(
      503,
      "Set NUXT_CANVA_APP_ID before using the Canva handoff.",
    );
  if (!allowedUserIds.length && !allowUnlistedLocalUser)
    throw new HandoffError(
      503,
      "Set NUXT_CANVA_ALLOWED_USER_IDS before using the Canva handoff.",
    );
  let user;
  try {
    user = await verifiers.user.verify(token);
  } catch (error) {
    const reason =
      error instanceof TokenExpiredError
        ? "TOKEN_EXPIRED"
        : error instanceof TokenInvalidError
          ? "TOKEN_INVALID"
          : "VERIFICATION_UNAVAILABLE";
    console.error("[canva-publisher] user-token.verification.failed", {
      reason,
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    if (reason === "VERIFICATION_UNAVAILABLE")
      throw new HandoffError(
        503,
        "Could not reach Canva to verify your session. Please try again.",
        reason,
      );
    throw new HandoffError(
      401,
      reason === "TOKEN_EXPIRED"
        ? "Your Canva session token has expired. Reopen the app and try again."
        : "Invalid Canva user token. Reopen the app and try again.",
      reason,
    );
  }
  if (
    user.appId !== appId ||
    typeof user.userId !== "string" ||
    typeof user.brandId !== "string"
  ) {
    throw new HandoffError(401, "Invalid Canva user claims.");
  }
  if (!allowUnlistedLocalUser && !allowedUserIds.includes(user.userId))
    throw new HandoffError(
      403,
      "This Canva user is not authorized for the portfolio.",
    );
  return user;
}

export async function verifyDesign(
  token: string,
  appId: string,
  verifiers = getCanvaVerifiers(appId),
) {
  try {
    const design = await verifiers.design.verify(token);
    if (
      design.appId !== appId ||
      typeof design.designId !== "string" ||
      !design.designId
    )
      throw new Error();
    return design;
  } catch {
    throw new HandoffError(401, "Invalid or expired Canva design token.");
  }
}
