import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
const workflow = parse(
  readFileSync(
    new URL("../../../.github/workflows/verify-design-pr.yml", import.meta.url),
    "utf8",
  ),
);
const jobs = workflow.jobs;
const needs = {
  checks: { result: "success", outputs: { passed: "true" } },
  review: { result: "success", outputs: { findings: "0" } },
  repair: { result: "skipped" },
  "publish-repair": { result: "skipped" },
};
function condition(expression, state = needs, count = 0) {
  const code = expression
    .replace(/always\(\)/g, "true")
    .replace(/inputs\.repair_count/g, String(count))
    .replace(/needs\.([\w-]+)\.(outputs\.\w+|result)/g, (_, name, path) =>
      JSON.stringify(
        path.split(".").reduce((value, key) => value?.[key], state[name]) ?? "",
      ),
    );
  return Function(`return (${code});`)();
}
const state = (changes) =>
  Object.fromEntries(
    Object.entries(needs).map(([key, value]) => [
      key,
      {
        ...value,
        ...changes[key],
        outputs: { ...value.outputs, ...changes[key]?.outputs },
      },
    ]),
  );

test("verification checks are mandatory and model execution is isolated from publishing", () => {
  assert.deepEqual(jobs.review.permissions, {
    contents: "read",
    actions: "read",
  });
  assert.deepEqual(jobs.repair.permissions, {
    contents: "read",
    actions: "read",
  });
  const notification = parse(
    readFileSync(
      new URL(
        "../../../.github/workflows/notify-design-result.yml",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.deepEqual(notification.on.workflow_run.types, ["completed"]);
  const implementation = parse(
    readFileSync(
      new URL(
        "../../../.github/workflows/implement-design.yml",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.deepEqual(notification.on.workflow_run.workflows, [
    implementation.name,
    workflow.name,
  ]);
  assert.equal(notification.jobs.notify.permissions.deployments, "read");
  assert.equal(notification.jobs.notify.permissions["id-token"], "write");
  assert.equal(notification.jobs.notify.permissions.statuses, "read");
  assert.ok(Object.hasOwn(notification.on, "status"));
  assert.equal(
    notification.jobs.notify.steps[0].with.ref,
    "${{ github.workflow_sha }}",
  );
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
});

test("notification requires clean checks, clean review, and no repair publication", () => {
  assert.equal(condition(jobs.ready.if), true);
  for (const changes of [
    { checks: { outputs: { passed: "false" } } },
    { review: { outputs: { findings: "1" } } },
    { review: { result: "failure" } },
    { repair: { result: "success" } },
    { "publish-repair": { result: "failure" } },
  ]) {
    assert.equal(condition(jobs.ready.if, state(changes)), false);
  }
});

test("repair runs only for reported failure and stops after two attempts", () => {
  assert.equal(condition(jobs.repair.if), false);
  for (const changes of [
    { checks: { outputs: { passed: "false" } } },
    { review: { outputs: { findings: "1" } } },
  ]) {
    for (const count of [0, 1])
      assert.equal(condition(jobs.repair.if, state(changes), count), true);
    assert.equal(condition(jobs.repair.if, state(changes), 2), false);
    assert.equal(
      condition(jobs["human-attention"].if, state(changes), 2),
      true,
    );
  }
  assert.equal(
    condition(jobs.repair.if, state({ review: { result: "failure" } })),
    false,
  );
  assert.equal(
    condition(
      jobs["human-attention"].if,
      state({ "publish-repair": { result: "failure" } }),
    ),
    true,
  );
});

test("bot verification is allowed and generated code stays inside an isolated container", () => {
  for (const name of ["review", "repair"]) {
    const action = jobs[name].steps.find((step) =>
      step.uses?.startsWith("openai/"),
    );
    assert.equal(action.with["allow-bot-users"], "github-actions[bot]");
  }
  const build = jobs.review.steps.find(
    (step) => step.name === "Build fixture app inside an isolated container",
  ).run;
  const start = jobs.review.steps.find(
    (step) => step.name === "Start isolated fixture app",
  ).run;
  assert.match(
    build,
    /docker build --file control\/scripts\/design-browser.Dockerfile/,
  );
  assert.match(
    start,
    /--internal -o com\.docker\.network\.bridge\.gateway_mode_ipv4=isolated/,
  );
  assert.match(
    start,
    /--read-only --cap-drop ALL --security-opt no-new-privileges/,
  );
  assert.equal(/--volume|--mount|--env-file/.test(start), false);
  assert.equal(
    jobs.review.steps.some(
      (step) =>
        step["working-directory"] === "source" && /npm/.test(step.run || ""),
    ),
    false,
  );
  assert.match(jobs["inspection-link"].if, /report_uploaded != ''/);
});
