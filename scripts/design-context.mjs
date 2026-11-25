import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateContext(value, designId) {
  const request = value?.designRequest;
  if (!request || !uuid.test(request.id) || (designId && request.id !== designId) ||
      typeof request.instructions !== 'string' || !Number.isInteger(request.draft_version) || request.draft_version < 1 ||
      !Array.isArray(request.requirements) || !request.requirements.length ||
      !request.requirements.every(item => typeof item === 'string' && item.trim()) ||
      !Array.isArray(request.answers) || !Array.isArray(request.change_options)) throw new Error('Invalid approved design context');
  const url = new URL(request.design_image);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      !url.pathname.startsWith('/storage/v1/object/public/website_designs/')) throw new Error('Invalid approved image URL');
  return value;
}
export async function loadContext(directory, designId) {
  const bytes = await readFile(join(directory, 'input.json'));
  if (bytes.length > 2 * 1024 * 1024) throw new Error('Approved context is too large');
  return validateContext(JSON.parse(bytes), designId);
}
export async function prepareImage(directory, context, request = fetch) {
  const response = await request(context.designRequest.design_image, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok || !response.body) throw new Error('Could not download approved image');
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 20 * 1024 * 1024) throw new Error('Approved image is too large');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  const { default: sharp } = await import('sharp');
  const metadata = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata();
  if (metadata.format !== 'png' || !metadata.width || !metadata.height) throw new Error('Approved image must be PNG');
  await sharp(bytes, { limitInputPixels: 40_000_000 }).raw().toBuffer();
  const image = { sha256: createHash('sha256').update(bytes).digest('hex'), width: metadata.width, height: metadata.height };
  await writeFile(join(directory, 'design.png'), bytes);
  await writeFile(join(directory, 'image.json'), JSON.stringify(image));
  return image;
}
export async function verifyImage(directory) {
  const image = JSON.parse(await readFile(join(directory, 'image.json'), 'utf8'));
  const bytes = await readFile(join(directory, 'design.png'));
  if (createHash('sha256').update(bytes).digest('hex') !== image.sha256) throw new Error('Approved image does not match');
  return image;
}

// Download only approved storage assets before connecting the isolated browser.
export async function prepareReviewAssets(directory, context, request = fetch) {
  const origin = new URL(context.designRequest.design_image).origin;
  const latest = new Map();
  for (const answer of context.designRequest.answers) {
    if (answer.image) latest.set(answer.question_id, answer.image.url);
  }
  const assets = [];
  for (const value of new Set([context.designRequest.design_image, ...latest.values()])) {
    const url = new URL(value);
    if (url.origin !== origin || url.username || url.password || url.search || url.hash ||
        !['/storage/v1/object/public/website_designs/', '/storage/v1/object/public/design_images/'].some(prefix => url.pathname.startsWith(prefix))) throw new Error('Invalid approved asset URL');
    if (url.href === context.designRequest.design_image) {
      assets.push({ url: url.href, contentType: 'image/png', body: (await readFile(join(directory, 'design.png'))).toString('base64') });
      continue;
    }
    const response = await request(url.href, { redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!response.ok || !response.body) throw new Error('Could not download approved asset');
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 20 * 1024 * 1024) throw new Error('Approved asset is too large');
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    const { default: sharp } = await import('sharp');
    const metadata = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata();
    if (!['png', 'jpeg', 'webp'].includes(metadata.format)) throw new Error('Unsupported approved asset');
    await sharp(bytes, { limitInputPixels: 40_000_000 }).raw().toBuffer();
    assets.push({ url: url.href, contentType: `image/${metadata.format}`, body: bytes.toString('base64') });
  }
  await writeFile(join(directory, 'review-assets.json'), JSON.stringify(assets));
}
