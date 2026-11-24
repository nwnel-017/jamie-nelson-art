import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { loadContext, verifyImage } from './design-context.mjs';

export function validateContextRun(run, workflowRef) {
  if (run.event !== 'workflow_dispatch' || run.path !== '.github/workflows/implement-design.yml' ||
      run.head_branch !== workflowRef || run.run_attempt !== 1) throw new Error('Untrusted context workflow');
}

if (process.argv[1]?.endsWith('/fetch-design-context.mjs')) {
  const runId = process.env.CONTEXT_RUN_ID;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!/^[1-9][0-9]*$/.test(runId || '') || !/^[\w.-]+\/[\w.-]+$/.test(repository || '')) throw new Error('Invalid context run');
  const run = JSON.parse(execFileSync('gh', ['api', `repos/${repository}/actions/runs/${runId}`], { encoding: 'utf8' }));
  validateContextRun(run, process.env.WORKFLOW_REF);
  const directory = join(process.env.RUNNER_TEMP, 'technical-design-job');
  await mkdir(directory, { recursive: true });
  execFileSync('gh', ['run', 'download', runId, '--repo', repository, '--name', `technical-design-input-${runId}`, '--dir', directory]);
  const context = await loadContext(directory, process.env.DESIGN_ID);
  if (context.job?.id !== process.env.JOB_ID) throw new Error('Approved context belongs to a different job');
  await verifyImage(directory);
}
