import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AiModelAdapter,
  type AiModel,
  type AiModelInput,
} from "../server/utils/agent-handoff/ai-model";

test("model adapters can swap providers using the same input and result contract", async () => {
  const input: AiModelInput = {
    systemPrompt: "Analyze the artwork.",
    instructions: "Describe this artwork.",
    image: { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png" },
  };
  for (const text of ["First provider", "Second provider"]) {
    const model: AiModel = new AiModelAdapter(async (received) => {
      assert.equal(received, input);
      return text;
    });
    assert.deepEqual(await model.generate(input), { text });
  }
});
