// Throwaway experiment: fake prices, fake usage, loopback only; no production imports.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";

const proxyBinary = process.env.SPIKE_PROXY_BINARY;
assert(proxyBinary, "Set SPIKE_PROXY_BINARY to the official 0.169.0 proxy binary");
assert.match(spawnSync("codex", ["--version"], { encoding: "utf8" }).stdout, /0\.169\.0/);
const directory = await mkdtemp(path.join(os.tmpdir(), "design-budget-spike-"));
const database = path.join(directory, "ledger.sqlite");
const db = new DatabaseSync(database);
db.exec(`
  CREATE TABLE updates (id TEXT PRIMARY KEY, allowance INTEGER, spent INTEGER DEFAULT 0, stopped INTEGER DEFAULT 0);
  CREATE TABLE requests (id INTEGER PRIMARY KEY, update_id TEXT, held INTEGER, settled INTEGER DEFAULT 0);
`);
const received = [];
const forwarded = [];
const runs = [];
const proxies = [];
const servers = [];
let dbAvailable = true;

function addUpdate(id, allowance = 1000) {
  db.prepare("INSERT INTO updates (id, allowance) VALUES (?, ?)").run(id, allowance);
}
function balance(id) {
  return db.prepare(`SELECT *, (SELECT COALESCE(SUM(held),0) FROM requests WHERE update_id=updates.id) AS held FROM updates WHERE id=?`).get(id);
}
function reserve(id, requestedOutput = 20) {
  assert(dbAvailable, "database unavailable");
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = balance(id);
    const output = Math.min(requestedOutput, Math.floor((row.allowance - row.spent - row.held - 20) / 3));
    if (row.stopped || output < 1) throw new Error("budget stopped");
    const held = 20 + output * 3;
    const result = db.prepare("INSERT INTO requests (update_id, held) VALUES (?, ?)").run(id, held);
    db.exec("COMMIT");
    return { id: Number(result.lastInsertRowid), output, held };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
function stop(id) {
  db.prepare("UPDATE updates SET stopped=1 WHERE id=?").run(id);
}
function settle(id, usage) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db.prepare("SELECT * FROM requests WHERE id=?").get(id);
    if (row.settled) return;
    const cost = usage.input_tokens * 2 + usage.output_tokens * 3;
    assert(Number.isSafeInteger(cost) && cost >= 0 && cost <= row.held, "usage exceeds reservation");
    db.prepare("UPDATE updates SET spent=spent+? WHERE id=?").run(cost, row.update_id);
    db.prepare("UPDATE requests SET held=0, settled=1 WHERE id=?").run(id);
  } finally {
    db.exec("COMMIT");
  }
}
async function listen(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}
function event(type, data) {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
}
function fakeStream(number, tool, outputTokens = 5, usage = true) {
  const id = `resp_${number}`;
  return event("response.created", { response: { id } }) +
    event("response.output_item.done", { item: tool ? {
      type: "function_call", call_id: `call_${number}`, name: "get_goal",
      arguments: "{}",
    } : {
      type: "message", role: "assistant", id: `msg_${number}`,
      content: [{ type: "output_text", text: "Mock complete" }],
    } }) + event("response.completed", { response: { id, ...(usage ? { usage: {
      input_tokens: 10, output_tokens: outputTokens, total_tokens: 10 + outputTokens,
      input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 },
    } } : {}) } });
}
const upstream = await listen(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks));
  const update = req.url.slice(1);
  forwarded.push({ update, body });
  const number = forwarded.filter((item) => item.update === update).length;
  if (update === "race") await delay(100);
  if (update === "server-error") {
    res.writeHead(500).end("ambiguous fake failure");
    return;
  }
  const tool = ["tool", "budget", "compact"].includes(update) && number === 1;
  if (tool) assert(body.tools.some((item) => item.name === "get_goal"), JSON.stringify(body.tools));
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  if (update === "drop") {
    res.write(event("response.created", { response: { id: "dropped" } }));
    res.end();
  } else {
    res.end(fakeStream(number, tool, update === "budget" ? 20 : 5, update !== "missing"));
  }
});
const gateway = await listen(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const match = /^\/updates\/([a-z-]+)\/responses$/.exec(req.url);
  const update = match?.[1];
  received.push({ update, method: req.method, url: req.url, auth: req.headers.authorization });
  if (req.method !== "POST" || !update) return res.writeHead(403).end();
  if (req.headers.authorization !== `Bearer fake-${update}`) return res.writeHead(401).end();
  let reservation;
  try {
    const body = JSON.parse(Buffer.concat(chunks));
    assert.equal(body.model, "gpt-5.4");
    assert(!body.service_tier || body.service_tier === "default");
    assert(!body.context_management && !body.previous_response_id);
    assert((body.tools ?? []).every((tool) => ["function", "custom"].includes(tool.type)));
    reservation = reserve(update, Math.min(body.max_output_tokens ?? 20, 20));
    body.max_output_tokens = reservation.output;
    body.service_tier = "default";
    const response = await fetch(`${upstream}/${update}`, {
      method: "POST", redirect: "error", body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(5000),
    });
    assert(response.ok, "ambiguous upstream error");
    const stream = await response.text();
    const events = stream.split("\n").filter((line) => line.startsWith("data: ")).map((line) => JSON.parse(line.slice(6)));
    const usage = events.find((item) => item.type === "response.completed")?.response.usage;
    if (usage) settle(reservation.id, usage);
    else stop(update);
    res.writeHead(200, { "Content-Type": "text/event-stream" }).end(stream);
  } catch {
    if (reservation) stop(update);
    res.writeHead(402, { "Content-Type": "application/json" }).end(JSON.stringify({ error: { message: "Mock budget stopped", type: "budget_exceeded" } }));
  }
});

async function startProxy(update) {
  const info = path.join(directory, `${update}-proxy.json`);
  const env = { PATH: process.env.PATH, HOME: directory, TMPDIR: directory };
  const child = spawn(proxyBinary, ["--server-info", info, "--upstream-url", `${gateway}/updates/${update}/responses`], { env });
  proxies.push(child);
  let errors = "";
  child.stderr.on("data", (chunk) => { errors += chunk; });
  child.stdin.end(`fake-${update}\n`);
  for (let i = 0; i < 100; i++) {
    try {
      const data = JSON.parse(await readFile(info, "utf8"));
      return `http://127.0.0.1:${data.port}`;
    } catch {
      if (child.exitCode !== null) throw new Error(errors);
      await delay(50);
    }
  }
  throw new Error(`proxy startup timeout: ${errors}`);
}
async function runCodex(update, allowance = 1000, compact = false) {
  addUpdate(update, allowance);
  const proxy = await startProxy(update);
  const home = path.join(directory, update);
  await mkdir(home);
  const work = path.join(home, "work");
  await mkdir(work);
  // Same provider configuration as the pinned action; optional features stay off.
  await writeFile(path.join(home, "config.toml"), `
model_provider = "codex-action-responses-proxy"
model = "gpt-5.4"
approval_policy = "never"
project_doc_max_bytes = 0
web_search = "disabled"
model_auto_compact_token_limit = ${compact ? 1 : 1000000}
[features]
multi_agent = false
multi_agent_v2 = false
shell_tool = false
unified_exec = false
[agents]
enabled = false
[model_providers.codex-action-responses-proxy]
name = "Codex Action Responses Proxy"
base_url = "${proxy}/v1"
wire_api = "responses"
request_max_retries = 1
stream_max_retries = 1
stream_idle_timeout_ms = 2000
`);
  const env = { PATH: process.env.PATH, HOME: home, CODEX_HOME: home, TMPDIR: directory,
    HTTP_PROXY: proxy, HTTPS_PROXY: proxy, ALL_PROXY: proxy, NO_PROXY: "127.0.0.1,localhost" };
  const child = spawn("codex", ["exec", "--ephemeral", "--ignore-rules", "--skip-git-repo-check", "--sandbox", "read-only", "--json", "--cd", work, "Follow the mock response."], { env });
  let stdout = "", stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.stdin.end();
  const timer = setTimeout(() => child.kill("SIGKILL"), 20000);
  const code = await new Promise((resolve) => child.once("exit", resolve));
  clearTimeout(timer);
  const result = { update, code, stdout, stderr, balance: balance(update), forwarded: forwarded.filter((item) => item.update === update) };
  runs.push(result);
  assert.notEqual(code, null, `CLI timed out: ${stderr}`);
  return { ...result, proxy };
}
async function post(update, body = { model: "gpt-5.4" }, token = update, suffix = "responses") {
  return fetch(`${gateway}/updates/${update}/${suffix}`, {
    method: "POST", headers: { Authorization: `Bearer fake-${token}` }, body: JSON.stringify(body),
  });
}
function pass(message) { console.log(`PASS ${message}`); }

try {
  const tool = await runCodex("tool");
  assert.equal(tool.code, 0, tool.stderr + tool.stdout);
  assert.equal(tool.forwarded.length, 2);
  assert(tool.forwarded[1].body.input.some((item) => item.type === "function_call_output"));
  assert.equal(tool.balance.spent, 70);
  assert.equal(tool.balance.held, 0);
  assert(tool.forwarded.every((item) => item.body.max_output_tokens === 20 && item.body.service_tier === "default"));
  assert(received.filter((item) => item.update === "tool").every((item) => item.auth === "Bearer fake-tool"));
  pass("real CLI tool round trip through real proxy; output cap injected; actual usage settled");

  const budget = await runCodex("budget", 80);
  assert.notEqual(budget.code, 0);
  assert.equal(budget.forwarded.length, 1);
  assert.equal(budget.balance.spent, 80);
  assert.equal((await post("budget")).status, 402);
  pass("budget exhaustion blocks tool follow-up and later retry without another upstream request");

  for (const scenario of ["server-error", "drop", "missing"]) {
    const run = await runCodex(scenario);
    assert.equal(run.forwarded.length, 1);
    assert.equal(run.balance.held, 80);
    assert.equal(run.balance.stopped, 1);
    assert.equal((await post(scenario)).status, 402);
    if (scenario === "drop") assert(received.filter((item) => item.update === scenario).length > 1, "expected CLI stream retry through gateway");
    pass(`${scenario}: full reservation retained; further inference denied (CLI exit ${run.code})`);
  }

  addUpdate("race", 80);
  const race = await Promise.all([post("race"), post("race")]);
  assert.deepEqual(race.map((response) => response.status).sort(), [200, 402]);
  assert.equal(forwarded.filter((item) => item.update === "race").length, 1);
  pass("two overlapping HTTP requests compete for the last allowance; exactly one reaches upstream");
  addUpdate("held", 80);
  const held = reserve("held");
  assert.throws(() => reserve("held"));
  const reopened = new DatabaseSync(database);
  assert.equal(reopened.prepare("SELECT SUM(held) AS held FROM requests WHERE update_id='held'").get().held, 80);
  reopened.close();
  settle(held.id, { input_tokens: 10, output_tokens: 5 });
  settle(held.id, { input_tokens: 10, output_tokens: 5 });
  assert.equal(balance("held").spent, 35);
  const reduced = reserve("held");
  assert.equal(reduced.output, 8);
  assert.equal(reduced.held, 44);
  pass("durable reservation survives connection reopen; duplicate settlement ignored; remaining allowance reduces output cap");

  const before = forwarded.length;
  for (const [body, token, suffix, status] of [
    [{ model: "unknown" }, "tool", "responses", 402],
    [{ model: "gpt-5.4", service_tier: "priority" }, "tool", "responses", 402],
    [{ model: "gpt-5.4", tools: [{ type: "web_search" }] }, "tool", "responses", 402],
    [{ model: "gpt-5.4" }, "wrong", "responses", 401],
    [{ model: "gpt-5.4" }, "tool", "compact", 403],
  ]) assert.equal((await post("tool", body, token, suffix)).status, status);
  dbAvailable = false;
  assert.equal((await post("tool")).status, 402);
  dbAvailable = true;
  assert.equal(forwarded.length, before);
  for (const route of ["/v1/responses/compact", "/v1/chat/completions", "/unknown"]) {
    assert.equal((await fetch(tool.proxy + route, { method: "POST", body: "{}" })).status, 403);
  }
  assert.equal((await fetch(tool.proxy + "/v1/responses")).status, 403);
  const upgradeStatus = await new Promise((resolve, reject) => {
    const request = http.request(tool.proxy + "/v1/responses", {
      headers: { Connection: "Upgrade", Upgrade: "websocket", "Sec-WebSocket-Version": "13", "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==" },
    }, (response) => { response.resume(); resolve(response.statusCode); });
    request.on("error", reject);
    request.end();
  });
  assert.equal(upgradeStatus, 403);
  const replaced = await fetch(tool.proxy + "/v1/responses", {
    method: "POST", headers: { Authorization: "Bearer caller-cannot-change-this" },
    body: JSON.stringify({ model: "gpt-5.4" }),
  });
  assert.equal(replaced.status, 200);
  assert.equal(received.at(-1).auth, "Bearer fake-tool");
  pass("unpriced model, tier, paid tool, forged credential, database failure and alternate proxy routes fail closed");
  pass("real proxy replaces caller Authorization and preserves configured update URL");

  const compact = await runCodex("compact", 1000, true);
  assert.equal(compact.code, 0, compact.stderr);
  assert.equal(compact.forwarded.length, 3);
  assert(compact.forwarded.some((item) => JSON.parse(item.body.client_metadata["x-codex-turn-metadata"]).request_kind === "compaction"));
  assert.equal(compact.balance.spent, 105);
  assert.equal(compact.balance.held, 0);
  pass("forced real CLI compaction traverses gateway and spends from the same allowance");
  await writeFile(path.join(directory, "results.json"), JSON.stringify({ runs, received, forwarded }, null, 2));
  console.log(`Evidence: ${directory}/results.json`);
} finally {
  for (const child of proxies) child.kill("SIGTERM");
  await Promise.all(servers.map((server) => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); })));
  db.close();
  // Keep captured fake requests/results, never real credentials.
  for (const run of runs) await rm(path.join(directory, run.update), { recursive: true, force: true });
}
