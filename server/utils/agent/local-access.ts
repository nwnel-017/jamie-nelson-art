interface LocalCanvaAccessConfig {
  canvaAllowedUserIds: string;
  canvaAllowUnlistedLocalUsers?: boolean | string;
  aiProvider?: string;
  public?: { supabaseUrl?: string };
}

/** Explicit local test access still requires a valid Canva-signed user token. */
export function canUseLocalCanvaAccess(
  config: LocalCanvaAccessConfig,
  runtimeMode = process.env.NODE_ENV,
): boolean {
  if (
    runtimeMode !== "development" ||
    config.aiProvider !== "test" ||
    !(
      config.canvaAllowUnlistedLocalUsers === true ||
      config.canvaAllowUnlistedLocalUsers === "true"
    ) ||
    config.canvaAllowedUserIds
      .split(",")
      .some(
        (id) => id.trim() && id.trim() !== "REPLACE_WITH_YOUR_CANVA_USER_ID",
      )
  )
    return false;
  // Nuxt's dev proxy does not expose the original socket address. Require a
  // loopback database instead, so this convenience cannot access hosted data.
  try {
    const url = new URL(config.public?.supabaseUrl ?? "");
    return (
      ["http:", "https:"].includes(url.protocol) &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}
