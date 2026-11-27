import { createServer } from "node:http";
import { once } from "node:events";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import * as h3 from "h3";
import { client, owner, setResponses } from "./requirements-boundaries";
import { getCanvaVerifiers } from "../../server/utils/agent/canva";

export async function startRequirementsServer(output: string) {
  setResponses([]);
  const dispatches: Array<{ ref: string; inputs: Record<string, string> }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === "https://api.github.com/repos/test/portfolio/commits/master")
      return Response.json({ sha: "a".repeat(40) });
    if (
      url ===
      "https://api.github.com/repos/test/portfolio/actions/workflows/implement-design.yml/dispatches"
    ) {
      dispatches.push(JSON.parse(String(init?.body)));
      return Response.json({ workflow_run_id: 123 });
    }
    if (new URL(url).hostname === "api.github.com")
      throw new Error(`Unexpected GitHub request: ${url}`);
    return originalFetch(input, init);
  };
  Object.assign(globalThis, {
    defineEventHandler: h3.defineEventHandler,
    setHeader: h3.setHeader,
    getHeader: h3.getHeader,
    getQuery: h3.getQuery,
    setResponseStatus: h3.setResponseStatus,
    useRuntimeConfig: () => ({
      canvaAppId: "requirements-e2e",
      canvaAllowedUserIds: owner,
      canvaExportHosts: "export-download.canva.com",
      maxAnalyzeAttempts: 4,
      planningGithubToken: "test-token",
      planningRepository: "test/portfolio",
      planningRepositoryId: "123",
      planningWorkflowRef: "master",
      planningSourceRef: "master",
      planningBackendUrl: "https://portfolio.example",
      planningCodexModel: "test-model",
    }),
  });
  const verifiers = getCanvaVerifiers("requirements-e2e");
  verifiers.user.verify = async () => ({
    appId: "requirements-e2e",
    userId: owner,
    brandId: "test-team",
  });
  verifiers.design.verify = async () => ({
    appId: "requirements-e2e",
    designId: "test-design",
  });
  const { default: gather } =
    await import("../../server/api/agent/gather-requirements/index.post");
  const { default: clarify } =
    await import("../../server/api/agent/clarify-requirements/[id].post");
  const { default: upload } =
    await import("../../server/api/agent/images/[id].post");
  const { default: execute } =
    await import("../../server/api/agent/execute/[id].post");
  const router = h3
    .createRouter()
    .get(
      "/",
      h3.defineEventHandler(
        () =>
          '<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>',
      ),
    )
    .post("/api/agent/gather-requirements", gather)
    .post("/api/agent/clarify-requirements/:id", clarify)
    .post("/api/agent/images/:id", upload)
    .post("/api/agent/execute/:id", execute);
  for (const file of await readdir(output)) {
    if (!/\.(js|css)$/.test(file)) continue;
    router.get(
      `/${file}`,
      h3.defineEventHandler(async (event) => {
        h3.setHeader(
          event,
          "content-type",
          file.endsWith(".js") ? "text/javascript" : "text/css",
        );
        return readFile(join(output, file));
      }),
    );
  }
  const app = h3.createApp();
  app.use(router);
  const server = createServer(h3.toNodeListener(app));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing test server address");
  return {
    url: `http://127.0.0.1:${address.port}`,
    client,
    setResponses,
    dispatches,
    async close() {
      globalThis.fetch = originalFetch;
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      const saved = await client
        .from("design_requests")
        .select("id, design_image")
        .eq("canva_user_id", owner);
      if (saved.error) throw saved.error;
      const requestIds = (saved.data ?? []).map((request) => request.id);
      const assetPaths: string[] = [];
      if (requestIds.length) {
        const assets = await client
          .from("design_images")
          .select("storage_path")
          .in("design_request_id", requestIds);
        if (assets.error) throw assets.error;
        assetPaths.push(
          ...(assets.data ?? []).map((image) => image.storage_path),
        );
      }
      const removed = await client
        .from("design_requests")
        .delete()
        .eq("canva_user_id", owner);
      if (removed.error) throw removed.error;
      const paths = (saved.data ?? []).map(({ design_image }) =>
        new URL(design_image).pathname.split("/").pop()!,
      );
      if (paths.length) {
        const images = await client.storage
          .from("website_designs")
          .remove(paths);
        if (images.error) throw images.error;
      }
      if (assetPaths.length) {
        const assets = await client.storage
          .from("design_images")
          .remove(assetPaths);
        if (assets.error) throw assets.error;
      }
    },
  };
}

export type RequirementsServer = Awaited<
  ReturnType<typeof startRequirementsServer>
>;
