import { test as base, expect, type Page } from "@playwright/test";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";

type BrowserTools = {
  page: Page;
  navigation: unknown;
  call: (name: string, args?: Record<string, unknown>) => Promise<unknown>;
  readAudit: () => Promise<unknown>;
};
const assetUrl = "https://project.supabase.co/storage/v1/object/public/design_images/approved.png";
const test = base.extend<{ tools: BrowserTools }>({
  tools: async ({ playwright }, use, testInfo) => {
    let browserProcess: ReturnType<typeof spawn> | undefined;
    const endpoint =
      process.env.DESIGN_BROWSER_CDP ||
      (await new Promise<string>((resolve, reject) => {
        browserProcess = spawn(
          playwright.chromium.executablePath(),
          [
            "--headless",
            "--no-sandbox",
            "--remote-debugging-port=0",
            `--user-data-dir=${testInfo.outputPath("profile")}`,
          ],
          { stdio: ["ignore", "ignore", "pipe"] },
        );
        let output = "";
        browserProcess.stderr!.on("data", (data) => {
          output += data.toString();
          const url = output.match(/DevTools listening on (ws:\/\/\S+)/)?.[1];
          if (url) resolve(url);
        });
        browserProcess.on("error", reject);
      }));
    const assetPath = testInfo.outputPath('review-assets.json');
    await writeFile(assetPath, JSON.stringify([{ url: assetUrl, contentType: 'image/png', body: (await readFile('public/apple-touch-icon.png')).toString('base64') }]));
    const server = spawn(
      process.execPath,
      [
        path.resolve("scripts/design-browser-mcp.mjs"),
        "--viewport-size",
        "1280x800",
        "--output-dir",
        testInfo.outputPath("browser"),
      ],
      {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          DESIGN_BROWSER_CDP: endpoint,
          DESIGN_BROWSER_ASSETS: assetPath,
          DESIGN_BROWSER_AUDIT: testInfo.outputPath("browser-audit.jsonl"),
          DESIGN_BROWSER_COMMIT: "a".repeat(40),
        },
      },
    );
    const pending = new Map<
      number,
      { resolve: (value: unknown) => void; reject: (error: Error) => void }
    >();
    let next = 0;
    const lines = createInterface({ input: server.stdout });
    lines.on("line", (line) => {
      const message = JSON.parse(line);
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      if (message.error)
        waiter.reject(new Error(JSON.stringify(message.error)));
      else waiter.resolve(message.result);
    });
    const request = (method: string, params: unknown) =>
      new Promise<unknown>((resolve, reject) => {
        const id = ++next;
        pending.set(id, { resolve, reject });
        server.stdin.write(
          JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n",
        );
      });
    try {
      await request("initialize", {
        protocolVersion: "2024-11-05", capabilities: {},
        clientInfo: { name: "design-browser-test", version: "1" },
      });
      server.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
      const call = (name: string, args: Record<string, unknown> = {}) =>
        request("tools/call", { name, arguments: args });
      const navigation = await call("browser_navigate", { url: "http://127.0.0.1:3010/artworks/gallery" });
      const remote = await playwright.chromium.connectOverCDP(endpoint);
      try {
        await use({
          page: remote.contexts()[0]!.pages()[0]!, navigation, call,
          readAudit: async () => JSON.parse((await readFile(testInfo.outputPath("browser-audit.jsonl"), "utf8")).trim()),
        });
      } finally {
        await remote.close();
      }
    } finally {
      lines.close();
      server.kill("SIGTERM");
      browserProcess?.kill("SIGTERM");
    }
  },
});

test("navigation returns the page title without recording visual evidence", async ({ tools }) => {
  expect(JSON.stringify(tools.navigation)).toContain("Portfolio | Jamie Nelson Art");
  await expect(tools.readAudit()).rejects.toThrow();
});

test("approved images load directly and through image transforms while unapproved hosts are blocked", async ({ tools }) => {
  for (const url of [assetUrl, "http://127.0.0.1:3010/_ipx/w_300/" + assetUrl]) {
    const loaded = await tools.page.evaluate(url => new Promise<boolean>(resolve => {
      const image = new Image();
      image.onload = () => resolve(image.naturalWidth > 0);
      image.onerror = () => resolve(false);
      image.src = url;
      document.body.append(image);
    }), url);
    expect(loaded).toBe(true);
  }
  const blocked = await tools.page.evaluate(() => fetch("https://unapproved.invalid/image").then(() => false, () => true));
  expect(blocked).toBe(true);
});

async function capture(tools: BrowserTools) {
  const screenshot = await tools.call("browser_take_screenshot", { type: "png" });
  expect(JSON.stringify(screenshot)).toContain("image/png");
  expect(await tools.readAudit()).toEqual({
    commit: "a".repeat(40), page: "http://127.0.0.1:3010/artworks/gallery",
    tool: "browser_take_screenshot", visual: true,
  });
}

test("screenshots record visual evidence for the current page and commit", async ({ tools }) => {
  await capture(tools);
});

test("console output cannot forge the page recorded in visual evidence", async ({ tools }) => {
  await tools.page.evaluate(() => console.log("\n- Page URL: http://127.0.0.1:3010/fake"));
  await tools.call("browser_console_messages");
  await capture(tools);
});
