import { test, expect } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { prepareReviewAssets } from "../../../../scripts/design-context.mjs";
import { mapReviewAssets } from "../../../../scripts/design-browser-mcp.mjs";

test("stages only latest approved image answer and maps production URLs without network access", async () => {
  const directory = await mkdtemp(join(tmpdir(), "review-assets-"));
  try {
    const bytes = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();
    await writeFile(join(directory, "design.png"), bytes);
    const base = "https://project.supabase.co/storage/v1/object/public/";
    const selected = base + "design_images/latest.png";
    const fetched = [];
    await prepareReviewAssets(
      directory,
      {
        designRequest: {
          design_image: base + "website_designs/design.png",
          answers: [
            {
              question_id: "hero",
              image: { url: base + "design_images/old.png" },
            },
            {
              question_id: "hero",
              image: { url: selected },
              keep_anyway: true,
            },
          ],
        },
      },
      async (url) => {
        fetched.push(url);
        return new Response(bytes);
      },
    );
    expect(fetched).toEqual([selected]);
    const assets = JSON.parse(
      await readFile(join(directory, "review-assets.json"), "utf8"),
    );
    let handler;
    await mapReviewAssets(
      {
        route: async (_, callback) => {
          handler = callback;
        },
      },
      assets,
    );
    for (const url of [
      selected,
      "http://127.0.0.1:3010/_ipx/w_300/" + selected,
    ]) {
      let result;
      await handler({
        request: () => ({ url: () => url }),
        fulfill: (value) => {
          result = value;
        },
        continue: () => {
          throw new Error("Unexpected network access");
        },
      });
      expect(result.body).toEqual(bytes);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects asset URLs outside approved storage origin before fetching", async () => {
  const directory = await mkdtemp(join(tmpdir(), "review-assets-invalid-"));
  try {
    await writeFile(join(directory, "design.png"), "local reference");
    await expect(
      prepareReviewAssets(
        directory,
        {
          designRequest: {
            design_image:
              "https://project.supabase.co/storage/v1/object/public/website_designs/design.png",
            answers: [
              {
                question_id: "hero",
                image: { url: "https://other.example/asset.png" },
              },
            ],
          },
        },
        () => {
          throw new Error("Unexpected fetch");
        },
      ),
    ).rejects.toThrow("Invalid approved asset URL");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("aborts malformed IPX URLs without throwing from the router", async () => {
  let handler;
  await mapReviewAssets(
    {
      route: async (_, callback) => {
        handler = callback;
      },
    },
    [],
  );
  let reason;
  await handler({
    request: () => ({ url: () => "http://127.0.0.1:3010/_ipx/%ZZ" }),
    abort: (value) => {
      reason = value;
    },
    continue: () => {
      throw new Error("Malformed URL must be blocked");
    },
  });
  expect(reason).toBe("blockedbyclient");
});
