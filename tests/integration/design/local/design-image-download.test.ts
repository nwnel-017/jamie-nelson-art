import assert from "node:assert/strict";
import sharp from "sharp";
import { MockAgent } from "undici";
import { beforeAll, test } from "vitest";
import { HandoffError } from "../../../../server/utils/agent/errors";
import {
  createPublicLookup,
  downloadImage,
  readImageBytes,
  validatePng,
} from "../../../../server/utils/agent/handoff/image";
import { MAX_IMAGE_BYTES } from "../../../../server/utils/agent/handoff/validation";

let png: Buffer;

beforeAll(async () => {
  png = await sharp({
    create: { width: 2, height: 3, channels: 4, background: "red" },
  })
    .png()
    .toBuffer();
});

function status(code: number) {
  return (error: unknown) =>
    error instanceof HandoffError && error.statusCode === code;
}

test("DNS connector refuses mixed public/private results and uses vetted results", async () => {
  const resolve = async (
    addresses: {
      address: string;
      family: number;
    }[],
  ) => {
    const fn = createPublicLookup(
      (async () => addresses) as unknown as Parameters<
        typeof createPublicLookup
      >[0],
    );
    return new Promise((accept, reject) =>
      fn("export-download.canva.com", { all: true }, (error, result) =>
        error ? reject(error) : accept(result),
      ),
    );
  };
  await assert.rejects(
    resolve([
      { address: "8.8.8.8", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ]),
  );
  assert.deepEqual(await resolve([{ address: "8.8.8.8", family: 4 }]), [
    { address: "8.8.8.8", family: 4 },
  ]);
});

test("enforces the streamed image byte limit even without Content-Length", async () => {
  async function* oversized() {
    yield Buffer.alloc(MAX_IMAGE_BYTES);
    yield Buffer.from([1]);
  }
  async function* empty() {}
  await assert.rejects(readImageBytes(oversized()), status(413));
  await assert.rejects(readImageBytes(empty()), status(422));
});

test("fully decodes PNG and rejects fake, corrupt, mismatched and appended files", async () => {
  await validatePng(png, { widthPx: 2, heightPx: 3 });
  await assert.rejects(
    validatePng(Buffer.from("<svg><script>alert(1)</script></svg>"), {
      widthPx: 2,
      heightPx: 3,
    }),
    status(415),
  );
  await assert.rejects(
    validatePng(png.subarray(0, png.length - 10), { widthPx: 2, heightPx: 3 }),
    status(422),
  );
  await assert.rejects(
    validatePng(png, { widthPx: 3, heightPx: 3 }),
    status(422),
  );
  await assert.rejects(
    validatePng(
      Buffer.concat([png, Buffer.from("malicious trailing payload")]),
      { widthPx: 2, heightPx: 3 },
    ),
    status(422),
  );
  const animated = Buffer.from(png);
  animated.write("acTL", 12, "ascii");
  await assert.rejects(
    validatePng(animated, { widthPx: 2, heightPx: 3 }),
    status(422),
  );
});

test("downloader accepts bytes, rejects redirects and lies in size/type", async () => {
  for (const [code, bytes, headers, expected] of [
    [200, png, { "content-type": "application/octet-stream" }, 0],
    [302, "", { location: "https://127.0.0.1/secrets" }, 502],
    [200, png, { "content-length": String(MAX_IMAGE_BYTES + 1) }, 413],
    [200, png, { "content-encoding": "gzip" }, 415],
    [403, "", {}, 502],
  ] as const) {
    const agent = new MockAgent();
    agent.disableNetConnect();
    agent
      .get("https://export-download.canva.com")
      .intercept({ path: "/image.png", method: "GET" })
      .reply(code, bytes, { headers });
    const result = downloadImage(
      "https://export-download.canva.com/image.png",
      ["export-download.canva.com"],
      agent,
    );
    if (expected) await assert.rejects(result, status(expected));
    else assert.deepEqual(await result, png);
    await agent.close();
  }
});

test("maps network timeouts and failures to safe gateway errors", async () => {
  for (const [code, expected] of [
    ["UND_ERR_HEADERS_TIMEOUT", 504],
    ["ECONNRESET", 502],
  ] as const) {
    const agent = new MockAgent();
    agent.disableNetConnect();
    agent
      .get("https://export-download.canva.com")
      .intercept({ path: "/image.png", method: "GET" })
      .replyWithError(
        Object.assign(new Error("private transport details"), { code }),
      );
    await assert.rejects(
      downloadImage(
        "https://export-download.canva.com/image.png",
        ["export-download.canva.com"],
        agent,
      ),
      status(expected),
    );
    await agent.close();
  }
});
