import { readFile, appendFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

const text = z.string().trim().min(1).max(4000);
export const reviewSchema = z.object({
  findings: z.array(z.object({ severity: z.literal('blocking'), file: text, line: z.number().int().positive(), evidence: text, recommendation: text }).strict()).max(30),
  inspection: z.object({
    status: z.enum(['complete', 'incomplete']),
    commit: z.string().regex(/^[0-9a-f]{40}$/),
    pages: z.array(z.string().url().refine(value => new URL(value).origin === 'http://127.0.0.1:3010')).max(50),
    report: text,
  }).strict(),
}).strict();
export function reviewOutcome(value, head, evidence = []) {
  const review = reviewSchema.parse(value);
  if (review.inspection.commit !== head) throw new Error('Review belongs to a different commit');
  if (review.inspection.status === 'complete' && !review.inspection.pages.length) throw new Error('No pages inspected');
  if (review.inspection.status === 'complete' && review.inspection.pages.some(page => !evidence.some(entry => entry.commit === head && entry.page === page && entry.tool === 'browser_take_screenshot' && entry.visual === true))) throw new Error('No trusted visual inspection evidence for reported pages');
  return { review, findings: review.findings.length + (review.inspection.status === 'incomplete' ? 1 : 0) };
}
if (process.argv[1]?.endsWith('/design-review-result.mjs')) {
  const file = join(process.env.RUNNER_TEMP, 'implementation-review.json');
  const bytes = await readFile(file);
  if (bytes.length > 256 * 1024) throw new Error('Review is too large');
  const audit = await readFile(join(process.env.RUNNER_TEMP, 'browser-audit.jsonl'), 'utf8').catch(() => '');
  const evidence = audit.trim() ? audit.trim().split('\n').map(line => JSON.parse(line)) : [];
  const { review, findings } = reviewOutcome(JSON.parse(bytes), process.env.EXPECTED_SHA, evidence);
  await appendFile(process.env.GITHUB_OUTPUT, `findings=${findings}\n`);
  await writeFile(join(process.env.RUNNER_TEMP, 'inspection-report.md'), `# Design inspection\n\nCommit: ${review.inspection.commit}\n\nStatus: ${review.inspection.status}\n\n${review.inspection.report}\n\nPages:\n${review.inspection.pages.map(page => `- ${page}`).join('\n')}\n`);
  if (review.inspection.status !== 'complete') throw new Error('Browser inspection is incomplete; human attention required');
}

