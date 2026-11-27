import assert from "node:assert/strict";
import { test } from "vitest";
import { HandoffError } from "../../../server/utils/agent/errors";
import {
  isPublicAddress,
  validateExportUrl,
} from "../../../server/utils/agent/handoff/image";

const designToken = "signed-design-token";

function payload() {
  return {
    source: "canva",
    changeOptions: ["existing_pages", "website_theme"],
    instructions: "Add this artwork to the portfolio gallery.",
    outputMedia: [
      {
        mediaSlotId: "media",
        files: [
          {
            format: "png",
            url: "https://export-download.canva.com/image.png?signature=test",
            widthPx: 2,
            heightPx: 3,
            contentMetadata: {
              type: "design",
              designToken,
              title: "Artwork",
              pages: [{ pageId: "page", pageNumber: 1 }],
            },
          },
        ],
      },
    ],
  };
}

function status(code: number) {
  return (error: unknown) =>
    error instanceof HandoffError && error.statusCode === code;
}

test("only accepts exact configured HTTPS export hosts", () => {
  assert.equal(
    validateExportUrl(payload().outputMedia[0]!.files[0]!.url, [
      "export-download.canva.com",
    ]).hostname,
    "export-download.canva.com",
  );
  for (const url of [
    "http://export-download.canva.com/a",
    "https://export-download.canva.com.evil.example/a",
    "https://export-download.canva.com@evil.example/a",
    "https://user:secret@export-download.canva.com/a",
    "https://export-download.canva.com:444/a",
    "https://127.0.0.1/a",
    "file:///etc/passwd",
    "https://export-download.canva.com/a#fragment",
  ])
    assert.throws(
      () => validateExportUrl(url, ["export-download.canva.com"]),
      status(400),
    );
});

test("blocks private, loopback, mapped, reserved and link-local addresses", () => {
  for (const address of [
    "127.0.0.1",
    "0.0.0.0",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "224.0.0.1",
    "::1",
    "::",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "not-an-ip",
  ])
    assert.equal(isPublicAddress(address), false, address);
  for (const address of ["8.8.8.8", "2606:4700:4700::1111"])
    assert.equal(isPublicAddress(address), true, address);
});
