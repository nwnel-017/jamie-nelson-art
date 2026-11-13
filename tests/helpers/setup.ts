import { vi } from "vitest";
import * as h3 from "h3";
for (const name of [
  "defineEventHandler",
  "createError",
  "readBody",
  "readMultipartFormData",
  "readRawBody",
  "getHeader",
  "getRequestURL",
] as const) {
  vi.stubGlobal(name, h3[name]);
}
vi.stubGlobal("useRuntimeConfig", () => ({
  public: {
    admin: "admin@example.test",
    supabaseUrl: "http://localhost:54321",
  },
  supabaseServiceKey: "test-only",
  stripeSecretKey: "sk_test_fake",
  stripeWebhookSecret: "whsec_test",
}));
process.env.STRIPE_SECRET_KEY = "sk_test_fake";
