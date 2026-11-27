import { createVerificationModel } from "../../../server/utils/agent/model-factory";
import { VerificationAgent } from "../../../server/utils/agent/verification-agent";
import { HandoffError } from "../../../server/utils/agent/errors";
import { test } from "vitest";
import assert from "node:assert/strict";

test("test model works without credentials and returns a deterministic analysis with three questions", async () => {
  const model = createVerificationModel({
    aiProvider: "test",
    aiApiKey: "",
    aiModel: "",
    aiBaseUrl: "",
  });
  const agent = new VerificationAgent(model);
  const input = {
    instructions: "Update the gallery.",
    changeOptions: ["existing_pages" as const],
    image: { bytes: new Uint8Array([1]), mimeType: "image/png" as const },
  };
  const first = await agent.run(input);
  const second = await agent.run({
    ...input,
    instructions: "Create a new page.",
  });
  assert.deepEqual(first, second);
  assert.equal(first.clarifying_questions.length, 3);
  assert.equal(first.ambiguities.length, 3);
  assert.ok(first.requirements[0]?.startsWith("Test analysis:"));
});

test("model selection rejects unsupported providers and never silently falls back from a real model", () => {
  for (const provider of ["unknown", "chat-completions"]) {
    assert.throws(
      () =>
        createVerificationModel({
          aiProvider: provider,
          aiApiKey: "",
          aiModel: "",
          aiBaseUrl: "",
        }),
      (error: unknown) =>
        error instanceof HandoffError && error.statusCode === 503,
    );
  }
});
