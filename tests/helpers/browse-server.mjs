import { readFileSync } from "node:fs";
import { createServer } from "node:http";
const id = "550e8400-e29b-41d4-a716-446655440000";
const artwork = {
  id,
  title: "CI Flowers",
  description: "Original flower painting",
  dimensions: "20 x 30",
  medium: "Oil",
  year: 2025,
  price: 250,
  sold: false,
  image_path: "flowers.png",
};
const image = readFileSync(new URL('../../public/apple-touch-icon.png', import.meta.url));
createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:54399");
  if (url.pathname.startsWith("/storage/")) {
    res.setHeader("Content-Type", "image/png");
    return res.end(image);
  }
  res.setHeader("Content-Type", "application/json");
  const table = url.pathname.split("/").pop();
  let rows;
  if (table === "artworks") rows = [artwork];
  else if (table === "gallery_images")
    rows = [
      { id: "gallery-1", artwork_id: id, image_path: "detail.png", order: 1 },
      { id: "gallery-2", artwork_id: id, image_path: "detail2.png", order: 2 },
    ];
  else if (table === "artist_profile")
    rows = [{ id: true, bio: "Artist biography", profile_image_path: null }];
  else if (url.pathname === "/health") return res.end("{}");
  else {
    res.statusCode = 500;
    return res.end(
      JSON.stringify({ message: `Unexpected fixture request ${req.url}` }),
    );
  }
  res.end(
    JSON.stringify(
      req.headers.accept?.includes("object+json") ? rows[0] : rows,
    ),
  );
}).listen(54399, "127.0.0.1");
