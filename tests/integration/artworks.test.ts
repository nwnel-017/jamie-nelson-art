import { beforeEach, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { endpoint } from "../helpers/http";
import { serverSupabaseClient } from "../helpers/supabase";
import list from "../../server/api/artworks/artworks.get";
import details from "../../server/api/artworks/[id].get";
import gallery from "../../server/api/artworks/gallery/[id].get";

const id = "550e8400-e29b-41d4-a716-446655440000";
const other = "550e8400-e29b-41d4-a716-446655440001";
const artwork = { id, title: "Flowers", price: 250, image_path: "flowers.png" };
let fail = false;
beforeEach(() => {
  fail = false;
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (fail)
      return new Response(JSON.stringify({ message: "database unavailable" }), {
        status: 500,
      });
    let rows: Record<string, unknown>[] = url.pathname.endsWith("gallery_images")
      ? [
          { id: "image-1", artwork_id: id, image_path: "detail.png", order: 1 },
          {
            id: "image-2",
            artwork_id: other,
            image_path: "other.png",
            order: 2,
          },
        ]
      : [artwork, { ...artwork, id: other, title: "Other" }];
    for (const field of ["id", "artwork_id"]) {
      const filter = url.searchParams.get(field);
      if (filter) rows = rows.filter((row) => row[field] === filter.slice(3));
    }
    return new Response(
      JSON.stringify(
        request.headers.get("accept")?.includes("object+json") ? rows[0] : rows,
      ),
      { headers: { "Content-Type": "application/json" } },
    );
  });
  serverSupabaseClient.mockResolvedValue(
    createClient("http://localhost:54321", "test-only", { global: { fetch } }),
  );
});
it("lists artworks with public image URLs", async () => {
  const response = await endpoint(
    "/artworks",
    list,
  )(new Request("http://localhost/artworks"));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id,
        title: "Flowers",
        image_path:
          "http://localhost:54321/storage/v1/object/public/artwork_images/flowers.png",
      }),
    ]),
  );
});
it("returns the requested artwork details", async () => {
  const response = await endpoint(
    "/artworks/:id",
    details,
  )(new Request(`http://localhost/artworks/${id}`));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    id,
    title: "Flowers",
    price: 250,
  });
});
it("returns only gallery images belonging to the requested artwork", async () => {
  const response = await endpoint(
    "/gallery/:id",
    gallery,
  )(new Request(`http://localhost/gallery/${id}`));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual([
    expect.objectContaining({
      artwork_id: id,
      image_path:
        "http://localhost:54321/storage/v1/object/public/gallery_images/detail.png",
    }),
  ]);
});
it("reports a database failure instead of successful empty artwork data", async () => {
  fail = true;
  expect(
    (
      await endpoint(
        "/artworks",
        list,
      )(new Request("http://localhost/artworks"))
    ).status,
  ).toBe(500);
});
