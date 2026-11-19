import { test, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const jobId = "12345678-1234-4234-8234-123456789abc";
const workflowSha = "b".repeat(40);
const designSha = "a".repeat(40);
const repository = "/repos/owner/repo";
const planningRun = {
  id: 12,
  head_sha: workflowSha,
  run_attempt: 1,
  event: "workflow_dispatch",
  path: ".github/workflows/generate-technical-instructions.yml",
  head_branch: "master",
  display_title: `Technical design job ${jobId}`,
  conclusion: "failure",
};

type Route = { path: string; data: unknown };

function runNotification(run: typeof planningRun, routes: Route[]) {
  const directory = mkdtempSync(join(tmpdir(), "design-notification-"));
  const eventFile = join(directory, "event.json");
  const emailFile = join(directory, "email.json");
  const preloadFile = join(directory, "http.mjs");
  const undici = createRequire(import.meta.url).resolve("undici");

  writeFileSync(eventFile, JSON.stringify({ workflow_run: run }));
  // Intercept real fetch requests in the child process; all other network access fails.
  writeFileSync(
    preloadFile,
    `
    import undici from ${JSON.stringify(undici)};
    import { writeFileSync } from 'node:fs';
    import { text } from 'node:stream/consumers';
    const agent = new undici.MockAgent();
    agent.disableNetConnect();
    undici.setGlobalDispatcher(agent);
    const github = agent.get('https://api.github.com');
    for (const route of ${JSON.stringify(routes)}) {
      github.intercept({ path: route.path, method: 'GET' })
        .reply(200, JSON.stringify(route.data)).persist();
    }
    github.intercept({ path: '${repository}/statuses/${workflowSha}', method: 'POST' })
      .reply(201, '{}').persist();
    agent.get('https://api.resend.com').intercept({ path: '/emails', method: 'POST' })
      .reply(async options => {
        writeFileSync(${JSON.stringify(emailFile)}, await text(options.body));
        return { statusCode: 200, data: JSON.stringify({ id: 'integration-email' }) };
      });
  `,
  );

  try {
    execFileSync(process.execPath, ["--import", preloadFile, "scripts/notify-design-result.mjs"], {
      timeout: 10000,
      env: {
        ...process.env,
        GITHUB_EVENT_PATH: eventFile,
        GITHUB_REPOSITORY: "owner/repo",
        GH_TOKEN: "test-token",
        DESIGN_WORKFLOW_REF: "master",
        DESIGN_PREVIEW_ENVIRONMENT: "Preview",
        RESEND_API_KEY: "test-key",
        RESEND_FROM_EMAIL: "updates@example.test",
        ADMIN_EMAIL: "admin@example.test",
      },
    });
    return JSON.parse(readFileSync(emailFile, "utf8"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const emptyEmailHistory = {
  path: `${repository}/commits/${workflowSha}/statuses?per_page=100&page=1`,
  data: [],
};

test("completed verification alerts the admin with the matching Vercel preview for approval", () => {
  const email = runNotification(
    {
      ...planningRun,
      path: ".github/workflows/verify-design-pr.yml",
      display_title: `Verify design PR #17 (repair 2) job ${jobId}`,
      conclusion: "success",
    },
    [
      emptyEmailHistory,
      {
        path: `${repository}/actions/runs/12/attempts/1/jobs?per_page=100`,
        data: {
          jobs: [{ name: "ready", conclusion: "success" }],
        },
      },
      {
        path: `${repository}/pulls/17`,
        data: {
          state: "open",
          head: { sha: designSha, ref: `agent/design-${jobId}` },
        },
      },
      {
        path: `${repository}/commits/${designSha}/statuses?per_page=100`,
        data: [
          {
            context: "design-verification",
            state: "success",
            target_url: "https://github.com/owner/repo/actions/runs/12",
          },
        ],
      },
      {
        path: `${repository}/deployments?sha=${designSha}&per_page=100`,
        data: [
          {
            id: 1,
            sha: designSha,
            environment: "Preview",
          },
        ],
      },
      {
        path: `${repository}/deployments/1/statuses?per_page=1`,
        data: [
          {
            state: "success",
            environment_url: "https://design-preview.vercel.app",
          },
        ],
      },
    ],
  );

  expect(email.to).toEqual(["admin@example.test"]);
  expect(email.text).toContain("ready for approval");
  expect(email.text).toContain("https://design-preview.vercel.app");
  expect(email.text).toContain("https://github.com/owner/repo/pull/17");
});

test("a terminal planning failure alerts the admin to contact the developer without needing a PR", () => {
  const email = runNotification(planningRun, [
    emptyEmailHistory,
    {
      path: `${repository}/actions/runs/12/attempts/1/jobs?per_page=100`,
      data: {
        jobs: [{ name: "plan", conclusion: "failure", steps: [] }],
      },
    },
  ]);

  expect(email.to).toEqual(["admin@example.test"]);
  expect(email.text).toContain("Something went wrong");
  expect(email.text).toContain("contact the developer");
  expect(email.text).toContain(jobId);
});
