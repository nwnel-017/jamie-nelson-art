// TO DO - verify --> is any of this really necessary? seems overkill
// simplify this
import { lookup } from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";
import ipaddr from "ipaddr.js";
import { Agent, request, type Dispatcher } from "undici";
import sharp from "sharp";
import { HandoffError } from "../errors";
import {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_PIXELS,
  type HandoffImage,
} from "./validation";

export function validateExportUrl(value: string, allowedHosts: string[]): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new HandoffError(400, "Invalid export URL.");
  }
  if (
    url.protocol !== "https:" ||
    isIP(url.hostname.replace(/^\[|\]$/g, "")) !== 0 ||
    !url.hostname.endsWith(".canva.com") ||
    url.username ||
    url.password ||
    url.hash ||
    (url.port && url.port !== "443") ||
    !allowedHosts.includes(url.hostname)
  ) {
    throw new HandoffError(
      400,
      "Export URL is not an allowed Canva HTTPS host.",
    );
  }
  return url;
}

export function isPublicAddress(address: string): boolean {
  try {
    const parsed = ipaddr.process(address);
    if (parsed.range() !== "unicast") return false;
    return (
      parsed.kind() !== "ipv6" ||
      (parsed as ipaddr.IPv6).match(ipaddr.parse("2000::") as ipaddr.IPv6, 3)
    );
  } catch {
    return false;
  }
}

// Vet DNS results in the connector itself, so a second DNS lookup cannot rebind
// a hostname to an internal address between validation and connection.
export function createPublicLookup(resolve = lookup): LookupFunction {
  return (hostname, options, callback) => {
    resolve(hostname, { all: true, verbatim: true }).then(
      (addresses) => {
        if (
          !addresses.length ||
          addresses.some(({ address }) => !isPublicAddress(address))
        ) {
          callback(
            new Error("Export host did not resolve to public addresses."),
            "",
          );
        } else if (options.all) {
          callback(null, addresses);
        } else {
          const address = addresses.find(
            (entry) => !options.family || entry.family === options.family,
          );
          if (!address) callback(new Error("No usable export address."), "");
          else callback(null, address.address, address.family);
        }
      },
      () => callback(new Error("Could not resolve export host."), ""),
    );
  };
}
export const publicLookup = createPublicLookup();

export async function readImageBytes(
  chunks: AsyncIterable<Uint8Array>,
): Promise<Buffer> {
  const buffers: Buffer[] = [];
  let size = 0;
  for await (const chunk of chunks) {
    size += chunk.byteLength;
    if (size > MAX_IMAGE_BYTES)
      throw new HandoffError(413, "Image exceeds the 5 MB limit.");
    buffers.push(Buffer.from(chunk));
  }
  if (!size) throw new HandoffError(422, "Image is empty.");
  return Buffer.concat(buffers, size);
}

export async function downloadImage(
  value: string,
  allowedHosts: string[],
  testDispatcher?: Dispatcher,
): Promise<Buffer> {
  const url = validateExportUrl(value, allowedHosts);
  const dispatcher =
    testDispatcher ??
    new Agent({
      connect: { lookup: publicLookup, timeout: 3000 },
    });
  try {
    const response = await request(url, {
      dispatcher,
      method: "GET",
      // undici.request does not follow redirects without a redirect interceptor.
      signal: AbortSignal.timeout(8000),
      headersTimeout: 5000,
      bodyTimeout: 3000,
      headers: { accept: "image/png", "accept-encoding": "identity" },
    });
    try {
      if (response.statusCode !== 200)
        throw new HandoffError(502, "Canva export download failed.");
      if (
        response.headers["content-encoding"] &&
        response.headers["content-encoding"] !== "identity"
      )
        throw new HandoffError(
          415,
          "Encoded export responses are not supported.",
        );
      const length = response.headers["content-length"];
      if (
        length &&
        (!/^\d+$/.test(String(length)) || Number(length) > MAX_IMAGE_BYTES)
      )
        throw new HandoffError(413, "Image exceeds the 5 MB limit.");
      return await readImageBytes(response.body);
    } finally {
      response.body.destroy();
    }
  } catch (error) {
    if (error instanceof HandoffError) throw error;
    const code = (error as { code?: string }).code;
    if (
      (error as Error).name === "TimeoutError" ||
      code === "UND_ERR_ABORTED" ||
      code?.includes("TIMEOUT")
    )
      throw new HandoffError(504, "Canva export download timed out.");
    throw new HandoffError(502, "Could not download the Canva export.");
  } finally {
    if (!testDispatcher) await dispatcher.destroy();
  }
}

export async function validatePng(
  bytes: Buffer,
  file: Pick<HandoffImage, "widthPx" | "heightPx">,
): Promise<void> {
  if (bytes.length > MAX_IMAGE_BYTES)
    throw new HandoffError(413, "Image exceeds the 5 MB limit.");
  if (
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    throw new HandoffError(415, "The export must be a PNG image.");
  const decodeChunks = [bytes.subarray(0, 8)];
  const pixelChunks = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS"]);
  let offset = 8;
  let ended = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (end > bytes.length || type === "acTL")
      throw new HandoffError(422, "PNG image is corrupt or animated.");
    if (pixelChunks.has(type)) decodeChunks.push(bytes.subarray(offset, end));
    else if (/^[A-Z]/.test(type))
      throw new HandoffError(422, "Unsupported critical PNG chunk.");
    offset = end;
    if (type === "IEND") {
      if (length !== 0 || offset !== bytes.length)
        throw new HandoffError(422, "PNG contains trailing data.");
      ended = true;
      break;
    }
  }
  if (!ended) throw new HandoffError(422, "PNG image is incomplete.");
  try {
    // Do not decompress untrusted textual, EXIF or color-profile metadata.
    // Only chunks needed to validate the pixels are handed to the decoder.
    const image = sharp(Buffer.concat(decodeChunks), {
      failOn: "warning",
      limitInputPixels: MAX_IMAGE_PIXELS,
    });
    const metadata = await image.metadata();
    if (
      metadata.format !== "png" ||
      (metadata.pages ?? 1) !== 1 ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > MAX_IMAGE_DIMENSION ||
      metadata.height > MAX_IMAGE_DIMENSION ||
      metadata.width * metadata.height > MAX_IMAGE_PIXELS
    )
      throw new HandoffError(422, "Invalid PNG dimensions or animation.");
    if (metadata.width !== file.widthPx || metadata.height !== file.heightPx)
      throw new HandoffError(
        422,
        "Image dimensions do not match the export metadata.",
      );
    // Force a complete decode; metadata parsing alone does not detect corrupt pixels.
    await image.raw().toBuffer();
  } catch (error) {
    if (error instanceof HandoffError) throw error;
    throw new HandoffError(
      422,
      "PNG image is corrupt or exceeds decoding limits.",
    );
  }
}
