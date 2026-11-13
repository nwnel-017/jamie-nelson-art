import { createApp, createRouter, toWebHandler, type EventHandler } from "h3";
export function endpoint(
  path: string,
  handler: EventHandler,
  method: "get" | "post" | "put" = "get",
) {
  const app = createApp();
  app.use(createRouter()[method](path, handler));
  return toWebHandler(app);
}
