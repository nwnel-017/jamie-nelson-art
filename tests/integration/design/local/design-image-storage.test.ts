import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import sharp from "sharp";
import { beforeAll, test } from "vitest";
import {
  deleteDesignImage,
  uploadDesignImage,
} from "../../../../server/services/website-designs-storage.service";
import type { Database } from "../../../../types/supabase/database";

let png: Buffer;

beforeAll(async () => {
  png = await sharp({
    create: { width: 2, height: 3, channels: 4, background: "red" },
  })
    .png()
    .toBuffer();
});

test("storage adapter uploads PNG bytes to website_designs with a unique path and returns its public URL", async () => {
  let uploadedPath = "";
  const client = createClient<Database>("https://storage.example", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (url, init) => {
        const path = new URL(String(url)).pathname;
        if (init?.method === "POST") {
          assert.match(
            path,
            /^\/storage\/v1\/object\/website_designs\/[a-f0-9-]{36}\.png$/,
          );
          assert.equal(
            new Headers(init.headers).get("content-type"),
            "image/png",
          );
          assert.equal(new Headers(init.headers).get("x-upsert"), "false");
          assert.equal(init.body, png);
          uploadedPath = path.split("/").at(-1)!;
          return new Response(
            JSON.stringify({ Key: `website_designs/${uploadedPath}` }),
            { status: 200 },
          );
        }
        assert.equal(init?.method, "DELETE");
        assert.deepEqual(JSON.parse(String(init?.body)), {
          prefixes: [uploadedPath],
        });
        return new Response("[]", { status: 200 });
      },
    },
  });
  const image = await uploadDesignImage(client, png);
  assert.equal(image.path, uploadedPath);
  assert.equal(
    image.url,
    `https://storage.example/storage/v1/object/public/website_designs/${uploadedPath}`,
  );
  await deleteDesignImage(client, image.path);
});
