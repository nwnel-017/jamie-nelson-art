import { test } from "vitest";
import assert from "node:assert/strict";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../types/supabase/database";
import { uploadClarificationImage } from "../../server/services/design-images.service";

const requestId = "12345678-1234-4234-8234-123456789abc";
const questionId = "12345678-1234-4234-8234-123456789abd";
function storage() {
  const uploaded: string[] = [];
  const client = createClient<Database>(
    "https://database.example",
    "test-key",
    {
      auth: { persistSession: false },
      global: {
        fetch: async (url, init) => {
          const parsed = new URL(String(url));
          const json = (value: unknown) =>
            new Response(JSON.stringify(value), {
              headers: { "content-type": "application/json" },
            });
          if (parsed.pathname.endsWith("/design_requests"))
            return json(
              parsed.searchParams.get("canva_user_id") === "eq.owner"
                ? [{ id: requestId }]
                : [],
            );
          if (parsed.pathname.endsWith("/design_analyses"))
            return json([
              {
                version: 1,
                ready: false,
                clarifying_questions: [
                  {
                    id: questionId,
                    type: "image",
                    question: "Upload the logo",
                  },
                ],
              },
            ]);
          if (parsed.pathname.includes("/storage/v1/object/")) {
            uploaded.push(parsed.pathname);
            return json({ Key: "image" });
          }
          if (parsed.pathname.endsWith("/design_images"))
            return json(JSON.parse(String(init?.body)));
          throw Error(`Unexpected request: ${parsed.pathname}`);
        },
      },
    },
  );
  return { client, uploaded };
}
test("a validated image is uploaded publicly with its filename and question association", async () => {
  const { client, uploaded } = storage();
  const bytes = await sharp({
    create: { width: 4, height: 3, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  const image = await uploadClarificationImage(
    client,
    requestId,
    "owner",
    { draft_version: 1, question_id: questionId, filename: "logo.png" },
    bytes,
  );
  assert.equal(image.filename, "logo.png");
  assert.equal(image.question_id, questionId);
  assert.match(
    image.url,
    /^https:\/\/database.example\/storage\/v1\/object\/public\/design_images\//,
  );
  assert.equal(uploaded.length, 1);
});

test("invalid, oversized, unauthorized, and stale image uploads never reach public storage", async () => {
  const valid = await sharp({
    create: { width: 4, height: 3, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  for (const scenario of [
    {
      bytes: Buffer.from("not an image"),
      user: "owner",
      version: 1,
      status: 422,
    },
    {
      bytes: Buffer.alloc(5 * 1024 * 1024 + 1),
      user: "owner",
      version: 1,
      status: 413,
    },
    { bytes: valid, user: "other", version: 1, status: 404 },
    { bytes: valid, user: "owner", version: 2, status: 409 },
  ]) {
    const { client, uploaded } = storage();
    await assert.rejects(
      uploadClarificationImage(
        client,
        requestId,
        scenario.user,
        {
          draft_version: scenario.version,
          question_id: questionId,
          filename: "logo.png",
        },
        scenario.bytes,
      ),
      (error: unknown) =>
        (error as { statusCode: number }).statusCode === scenario.status,
    );
    assert.equal(uploaded.length, 0);
  }
});

test("PNG, JPEG, and WebP uploads are accepted", async () => {
  for (const format of ["png", "jpeg", "webp"] as const) {
    const { client } = storage();
    const bytes = await sharp({
      create: { width: 4, height: 3, channels: 3, background: "red" },
    })
      .toFormat(format)
      .toBuffer();
    const image = await uploadClarificationImage(
      client,
      requestId,
      "owner",
      { draft_version: 1, question_id: questionId, filename: `logo.${format}` },
      bytes,
    );
    assert.match(image.url, new RegExp(`\\.${format}$`));
  }
});

test("an image exactly at 5 MB is accepted without resizing or compression", async () => {
  const { client } = storage();
  const image = await sharp({
    create: { width: 4, height: 3, channels: 3, background: "red" },
  })
    .jpeg()
    .toBuffer();
  const bytes = Buffer.concat([
    image,
    Buffer.alloc(5 * 1024 * 1024 - image.length),
  ]);
  await uploadClarificationImage(
    client,
    requestId,
    "owner",
    { draft_version: 1, question_id: questionId, filename: "large.jpg" },
    bytes,
  );
});
