import { getHeader, type H3Event } from "h3";
import { authorizeCanvaUser, bearerToken } from "../agent/canva";
import { canUseLocalCanvaAccess } from "../agent/local-access";

interface CanvaAuthConfig {
  canvaAppId: string;
  canvaAllowedUserIds: string;
  canvaAllowUnlistedLocalUsers?: boolean | string;
  aiProvider?: string;
  public?: { supabaseUrl?: string };
}

export async function requireCanvaUser(
  event: H3Event,
  config: CanvaAuthConfig = useRuntimeConfig(event),
) {
  const token = bearerToken(getHeader(event, "authorization"));
  const allowedUsers = config.canvaAllowedUserIds
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return authorizeCanvaUser(
    token,
    config.canvaAppId,
    allowedUsers,
    undefined,
    canUseLocalCanvaAccess(config),
  );
}
