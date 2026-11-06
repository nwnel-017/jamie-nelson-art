import {
  initDesignTokenVerifier,
  initUserTokenVerifier,
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
    const options = { appId, timeoutMs: 2500 };
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
  } catch {
    throw new HandoffError(401, "Invalid or expired Canva user token.");
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
