import { beforeEach, expect, it, vi } from "vitest";
import { endpoint } from "../helpers/http";
import { serverSupabaseClient, serverSupabaseUser } from "../helpers/supabase";
import add from "../../server/api/artworks/artwork.post";
import update from "../../server/api/artworks/[id].put";
import { createClient } from "@supabase/supabase-js";
let saved: Record<string, unknown> | null;
let writes: number;
let failUpload: boolean;
const id = "550e8400-e29b-41d4-a716-446655440000";
function request(method: string) {
  const body = new FormData();
  for (const [key, value] of Object.entries({
    id,
    title: "Flowers",
    description: "Original painting",
    price: "250",
    dimensions: "20 x 30",
    collection: id,
    year: "2025",
    medium: "Oil",
  }))
    body.set(key, value);
  body.set(
    "image",
    new Blob(
      [
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
          "base64",
        ),
      ],
      { type: "image/png" },
    ),
    "flowers.png",
  );
  return new Request("http://localhost/artworks", { method, body });
}
beforeEach(() => {
  vi.clearAllMocks();
  saved = null;
  writes = 0;
  failUpload = false;
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    if (req.method !== "GET") writes++;
    if (url.pathname.includes("/storage/"))
      return new Response(
        JSON.stringify(
          failUpload ? { message: "upload failed" } : { Key: "flowers.png" },
        ),
        { status: failUpload ? 500 : 200 },
      );
    if (url.pathname.endsWith("artworks") && req.method !== "GET") {
      saved = {
        id: url.searchParams.get("id")?.slice(3) || id,
        ...(await req.json()),
      };
      return new Response(JSON.stringify([saved]), {
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.pathname.endsWith("artworks"))
      return new Response(JSON.stringify({ id }));
    if (url.pathname.endsWith("gallery_images"))
      return new Response(JSON.stringify(req.method === "GET" ? null : []));
    throw new Error(`Unexpected request ${req.url}`);
  };
  serverSupabaseClient.mockResolvedValue(
    createClient("http://localhost:54321", "test-only", { global: { fetch } }),
  );
});
for (const [method, handler] of [
  ["post", add],
  ["put", update],
] as const) {
  it.each([
    [null, 401],
  ])(`${method} rejects unauthorized users (%s)`, async (user, status) => {
    serverSupabaseUser.mockResolvedValue(user as never);
    const response = await endpoint(
      "/artworks",
      handler,
      method,
    )(request(method));
    expect(response.status).toBe(status);
    expect(writes).toBe(0);
  });
  it(`${method} accepts a valid admin artwork form`, async () => {
    serverSupabaseUser.mockResolvedValue({
      email: "admin@example.test",
    } as never);
    const response = await endpoint(
      "/artworks",
      handler,
      method,
    )(request(method));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true });
    expect(saved).toMatchObject({
      id,
      title: "Flowers",
      price: 250,
      year: 2025,
      medium: "Oil",
    });
  });
}

it("does not report success when an admin image upload fails", async () => {
  serverSupabaseUser.mockResolvedValue({
    email: "admin@example.test",
  } as never);
  failUpload = true;
  expect(
    (await endpoint("/artworks", add, "post")(request("post"))).status,
  ).toBe(500);
  expect(saved).toBeNull();
});
