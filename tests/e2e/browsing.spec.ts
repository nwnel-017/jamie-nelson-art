import { test, expect } from "@playwright/test";
const id = "550e8400-e29b-41d4-a716-446655440000";
test("visitor opens an artwork from the portfolio", async ({ page }) => {
  await page.goto("/artworks/gallery");
  await expect(page.getByRole("heading", { name: "Portfolio" })).toBeVisible();
  const image = page.getByRole("img", { name: "CI Flowers" });
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  await page.locator(`a[href="/artworks/${id}"]`).click();
  await expect(page).toHaveURL(`/artworks/${id}`);
  await expect(page.getByRole("heading", { name: "CI Flowers" })).toBeVisible();
  await expect(page.getByText("Original flower painting")).toBeVisible();
});
test("visitor can load an artwork directly and view its image", async ({
  page,
}) => {
  await page.goto(`/artworks/${id}`);
  await expect(page.getByRole("heading", { name: "CI Flowers" })).toBeVisible();
  const image = page.getByRole("img", { name: "CI Flowers", exact: true });
  await expect
    .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
});


test("shared public styles keep headings visible without horizontal overflow", async ({ page }) => {
  const pages = [
    ["/", "About"],
    ["/artworks/gallery", "Portfolio"],
    ["/exhibitions", "Exhibitions & Projects"],
    ["/contact", "Contact"],
    ["/shop", "Shop"],
  ] as const;

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [path, heading] of pages) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(await page.getByRole("main").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    }
  }
});
