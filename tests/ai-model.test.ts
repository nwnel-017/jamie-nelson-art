import { createVerificationModel } from "../server/utils/agent/model-factory";
import { createChatCompletionModel } from "../server/utils/agent/chat-completion-model";
import { VerificationAgent } from "../server/utils/agent/verification-agent";
import { VERIFICATION_SYSTEM_PROMPT } from "../server/utils/agent/prompts/verification";
import { HandoffError } from "../server/utils/agent/errors";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AiModelAdapter,
  type AiModel,
  type AiModelInput,
} from "../server/utils/agent/ai-model";

test("model adapters can swap providers using the same input and result contract", async () => {
  const input: AiModelInput = {
    systemPrompt: "Analyze the artwork.",
    instructions: "Describe this artwork.",
    changeOptions: ["existing_pages"],
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

test("verification agent invokes the configured model with the existing prompt and image", async () => {
  const verification = {
    requirements: ["Update the gallery."],
    ambiguities: ["The gallery is unspecified."],
    clarifying_questions: ["Which gallery should change?"],
  };
  let calls = 0;
  const model = createChatCompletionModel(
    {
      apiKey: "test-secret",
      model: "configured-model",
      baseUrl: "https://model.example/v1/",
    },
    async (url, init) => {
      calls++;
      assert.equal(String(url), "https://model.example/v1/chat/completions");
      assert.equal(init?.method, "POST");
      assert.equal(init?.redirect, "error");
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        "Bearer test-secret",
      );
      assert.ok(init?.signal);
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, "configured-model");
      assert.deepEqual(body.response_format, { type: "json_object" });
      assert.deepEqual(body.messages, [
        { role: "system", content: VERIFICATION_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                instructions: "Update the gallery.",
                changeOptions: ["existing_pages"],
              }),
            },
            {
              type: "image_url",
              image_url: { url: "data:image/png;base64,AQID" },
            },
          ],
        },
      ]);
      return new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: { content: JSON.stringify(verification) },
            },
          ],
        }),
      );
    },
  );
  assert.deepEqual(
    await new VerificationAgent(model).run({
      instructions: "Update the gallery.",
      changeOptions: ["existing_pages"],
      image: { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png" },
    }),
    verification,
  );
  assert.equal(calls, 1);
});

test("missing configuration, provider failures, refusals and incomplete output produce safe errors", async () => {
  const config = {
    apiKey: "test-secret",
    model: "configured-model",
    baseUrl: "https://model.example/v1",
  };
  for (const invalid of [
    { ...config, apiKey: "" },
    { ...config, model: "" },
    { ...config, baseUrl: "http://model.example/v1" },
  ]) {
    assert.throws(
      () => createChatCompletionModel(invalid),
      (error: unknown) =>
        error instanceof HandoffError && error.statusCode === 503,
    );
  }
  const input = {
    instructions: "Update the gallery.",
    changeOptions: ["existing_pages" as const],
    image: { bytes: new Uint8Array([1]), mimeType: "image/png" as const },
  };
  for (const response of [
    new Response("provider private details", { status: 401 }),
    new Response("invalid JSON"),
    new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: { content: null, refusal: "Refused" },
          },
        ],
      }),
    ),
    new Response(
      JSON.stringify({
        choices: [{ finish_reason: "length", message: { content: "{}" } }],
      }),
    ),
    new Response(
      JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: "{}" } }],
      }),
    ),
  ]) {
    const agent = new VerificationAgent(
      createChatCompletionModel(config, async () => response),
    );
    await assert.rejects(
      agent.run(input),
      (error: unknown) =>
        error instanceof HandoffError &&
        error.statusCode === 502 &&
        !error.message.includes("private"),
    );
  }
});

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
