import assert from "node:assert/strict";
import { test } from "vitest";
import { canUseLocalCanvaAccess } from "../../../server/utils/agent/local-access";

test("local test access requires opt-in, development, a test model and local Supabase", () => {
  const config = {
    canvaAllowedUserIds: "",
    canvaAllowUnlistedLocalUsers: true,
    aiProvider: "test",
    public: { supabaseUrl: "http://127.0.0.1:54321" },
  };
  for (const host of ["127.0.0.1", "localhost", "[::1]"]) {
    assert.equal(
      canUseLocalCanvaAccess(
        { ...config, public: { supabaseUrl: `http://${host}:54321` } },
        "development",
      ),
      true,
    );
  }
  assert.equal(
    canUseLocalCanvaAccess(
      { ...config, canvaAllowedUserIds: "REPLACE_WITH_YOUR_CANVA_USER_ID" },
      "development",
    ),
    true,
  );
  assert.equal(canUseLocalCanvaAccess(config, "production"), false);
  assert.equal(
    canUseLocalCanvaAccess(
      { ...config, public: { supabaseUrl: "https://project.supabase.co" } },
      "development",
    ),
    false,
  );
  assert.equal(
    canUseLocalCanvaAccess(
      { ...config, aiProvider: "chat-completions" },
      "development",
    ),
    false,
  );
  assert.equal(
    canUseLocalCanvaAccess(
      { ...config, canvaAllowUnlistedLocalUsers: false },
      "development",
    ),
    false,
  );
  assert.equal(
    canUseLocalCanvaAccess(
      { ...config, canvaAllowedUserIds: "owner" },
      "development",
    ),
    false,
  );
});
