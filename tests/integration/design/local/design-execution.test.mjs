import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import sharp from "sharp";
import {
  prepareImage,
  validateContext,
  verifyImage,
} from "../../../../scripts/design-context.mjs";
const id = "12345678-1234-4234-8234-123456789abc";
const context = {
  designRequest: {
    id,
    draft_version: 2,
    instructions: "Update gallery",
    requirements: ["Make gallery blue"],
    answers: [
      {
        question_id: id,
        question: "Which logo?",
        answer: "Use the supplied logo in the header and footer",
        image: {
          id,
          question_id: id,
          filename: "logo.png",
          url: "https://storage.example/design_images/logo.png",
        },
      },
    ],
    change_options: [],
    design_image:
      "https://project.supabase.co/storage/v1/object/public/website_designs/design.png",
  },
};
async function fixture(t) {
  const temp = await mkdtemp(join(tmpdir(), "design-context-"));
  t.onTestFinished(() => rm(temp, { recursive: true, force: true }));
  const directory = join(temp, "technical-design-job");
  await mkdir(directory);
  const png = await sharp({
    create: { width: 16, height: 12, channels: 3, background: "blue" },
  })
    .png()
    .toBuffer();
  await writeFile(join(directory, "input.json"), JSON.stringify(context));
  return { temp, directory, png };
}
test("approved image is downloaded, decoded, and integrity checked before execution", async (t) => {
  const { directory, png } = await fixture(t);
  const image = await prepareImage(directory, context, async (_, options) => {
    assert.equal(options.redirect, "error");
    return new Response(png);
  });
  assert.equal(image.width, 16);
  assert.deepEqual(await verifyImage(directory), image);
  await writeFile(join(directory, "design.png"), "tampered");
  await assert.rejects(verifyImage(directory), /does not match/);
});
test("unavailable, malformed, and oversized image downloads fail", async (t) => {
  const { directory } = await fixture(t);
  for (const response of [
    new Response("", { status: 404 }),
    new Response("not PNG"),
    new Response(new Uint8Array(20 * 1024 * 1024 + 1)),
  ]) {
    await assert.rejects(
      prepareImage(directory, context, async () => response),
    );
  }
  assert.throws(() => validateContext(context, "wrong-id"));
  assert.throws(() =>
    validateContext({
      designRequest: {
        ...context.designRequest,
        design_image: "http://localhost/file",
      },
    }),
  );
});
test("execution consumes approved requirements and answers instead of technical instructions", async (t) => {
  const { temp, directory, png } = await fixture(t);
  await prepareImage(directory, context, async () => new Response(png));
  const run = () =>
    spawnSync(process.execPath, ["scripts/prepare-design-execution.mjs"], {
      encoding: "utf8",
      env: {
        ...process.env,
        RUNNER_TEMP: temp,
        GITHUB_WORKSPACE: temp,
        DESIGN_ID: id,
        TECHNICAL_EXECUTION_PROMPT_FILE:
          "server/utils/agent/prompts/execute-technical-instructions.ts",
      },
    });
  assert.equal(run().status, 0);
  const prompt = await readFile(
    join(directory, "execution-prompt.txt"),
    "utf8",
  );
  assert.match(prompt, /Make gallery blue/);
  assert.ok(prompt.includes("https://storage.example/design_images/logo.png"));
  assert.match(prompt, /header and footer/);
  assert.equal(prompt.includes("developer_instructions"), false);
  await writeFile(join(directory, "design.png"), "broken");
  assert.notEqual(run().status, 0);
});
