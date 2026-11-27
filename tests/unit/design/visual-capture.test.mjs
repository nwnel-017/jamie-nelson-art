import { test } from "vitest";
import assert from "node:assert/strict";
test("visual capture binds the image to the actual page and rejects navigation during capture", async () => {
  const { capturePage } =
    await import("../../../scripts/design-browser-mcp.mjs");
  const { EventEmitter } = await import("node:events");
  const frame = {};
  const page = Object.assign(new EventEmitter(), {
    url: () => "http://127.0.0.1:3010/artworks/gallery",
    mainFrame: () => frame,
    isClosed: () => false,
    screenshot: async () => Buffer.from("pixels"),
  });
  assert.equal((await capturePage(page)).page, page.url());
  page.screenshot = async () => {
    page.emit("framenavigated", frame);
    return Buffer.from("pixels");
  };
  await assert.rejects(capturePage(page), /Page changed during/);
});
