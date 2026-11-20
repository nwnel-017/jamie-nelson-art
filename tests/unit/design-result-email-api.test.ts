import { afterEach, test, expect, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createEvent, setHeader } from "h3";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import handler from "../../server/api/agent/technical-jobs/[id]/email.post";
import { serverSupabaseServiceRole } from "#supabase/server";

vi.mock("#supabase/server", () => ({ serverSupabaseServiceRole: vi.fn() }));
vi.mock("../../server/utils/auth/requireGitHubWorker", () => ({
  requireGitHubWorker: vi
    .fn()
    .mockResolvedValue({ runId: "12", runAttempt: 1 }),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test.each(["read", "save", "sent"])(
  "%s maps asynchronous database failures to the API error response",
  async (action) => {
    vi.stubGlobal("setHeader", setHeader);
    vi.stubGlobal("useRuntimeConfig", () => ({
      planningGithubToken: "test-token",
      planningRepository: "owner/repo",
      planningRepositoryId: "123",
      planningWorkflowRef: "master",
      planningSourceRef: "master",
      planningBackendUrl: "https://backend.example",
      planningCodexModel: "test-model",
    }));
    const client = createClient("http://localhost:54321", "test-key", {
      global: {
        fetch: async () =>
          new Response(JSON.stringify({ message: "database unavailable" }), {
            status: 503,
          }),
      },
    });
    vi.mocked(serverSupabaseServiceRole).mockReturnValue(client);
    const email = {
      outcome: "failure",
      message: {
        from: "updates@example.test",
        to: ["admin@example.test"],
        subject: "Failed",
        text: "Contact developer",
        html: "<p>Contact developer</p>",
      },
    };
    const req = new IncomingMessage(new Socket());
    req.headers = { "content-type": "application/json" };
    req.push(
      JSON.stringify({ action, ...(action === "save" ? { email } : {}) }),
    );
    req.push(null);
    const event = createEvent(req, new ServerResponse(req));
    event.context.params = { id: "12345678-1234-4234-8234-123456789abc" };
    await expect(handler(event)).rejects.toMatchObject({
      statusCode: 500,
      statusMessage:
        action === "read"
          ? "Could not read the result email."
          : action === "save"
            ? "Could not save the result email."
            : "Could not record email delivery.",
    });
  },
);
