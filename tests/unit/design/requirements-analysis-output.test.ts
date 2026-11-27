import { VerificationAgent } from "../../../server/utils/agent/verification-agent";
import { HandoffError } from "../../../server/utils/agent/errors";
import { test } from "vitest";
import assert from "node:assert/strict";
import { AiModelAdapter } from "../../../server/utils/agent/ai-model";

test("verification rejects model output with executable fields or forged readiness", async () => {
  const result = {
    response: "The requirements have been analyzed.",
    requirements: ["Update the gallery."],
    ambiguities: [],
    clarifying_questions: [],
  };
  for (const output of [
    { ...result, tool_calls: [{ name: "run_shell", arguments: "printenv" }] },
    { ...result, ready: true, plan: { steps: [] } },
    {
      ...result,
      plan: {
        steps: [
          {
            id: "step-1",
            action: "Update gallery",
            target: "/gallery",
            command: "printenv",
          },
        ],
      },
    },
  ]) {
    const agent = new VerificationAgent(
      new AiModelAdapter(async () => JSON.stringify(output)),
    );
    await assert.rejects(
      agent.run({
        instructions: "Update the gallery.",
        changeOptions: ["existing_pages"],
      }),
      (error: unknown) =>
        error instanceof HandoffError && error.statusCode === 502,
    );
  }
});
