import {
  initDesignTokenVerifier,
  initUserTokenVerifier,
} from "@canva/app-middleware";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, test } from "vitest";
import {
  authorizeCanvaUser,
  bearerToken,
  verifyDesign,
  type CanvaVerifiers,
} from "../../../../server/utils/agent/canva";
import { HandoffError } from "../../../../server/utils/agent/errors";

const appId = "test-app";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});

function token(claims: Record<string, unknown>, forged = false) {
  const body = [
    Buffer.from(
      JSON.stringify({ alg: "RS256", kid: "test-key", typ: "JWT" }),
    ).toString("base64url"),
    Buffer.from(
      JSON.stringify({
        aud: appId,
        exp: Math.floor(Date.now() / 1000) + 300,
        ...claims,
      }),
    ).toString("base64url"),
  ].join(".");
  return `${body}.${forged ? Buffer.alloc(256).toString("base64url") : sign("RSA-SHA256", Buffer.from(body), privateKey).toString("base64url")}`;
}

const userToken = token({ userId: "owner", brandId: "team" });

const designToken = token({ designId: "design" });

let jwks: Server;

let verifier: CanvaVerifiers;

async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

function close(server: Server) {
  return new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

beforeAll(async () => {
  const key = {
    ...publicKey.export({ format: "jwk" }),
    kid: "test-key",
    use: "sig",
    alg: "RS256",
  };
  jwks = createServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ keys: [key] }));
  });
  const baseUrl = await listen(jwks);
  verifier = {
    user: initUserTokenVerifier({ appId, baseUrl, timeoutMs: 1000 }),
    design: initDesignTokenVerifier({ appId, baseUrl, timeoutMs: 1000 }),
  };
});

afterAll(async () => {
  await close(jwks);
});

function status(code: number) {
  return (error: unknown) =>
    error instanceof HandoffError && error.statusCode === code;
}

test("verifies genuine Canva-shaped user and design JWTs using signed JWKS", async () => {
  assert.equal(
    (await authorizeCanvaUser(userToken, appId, ["owner"], verifier)).userId,
    "owner",
  );
  assert.equal(
    (await verifyDesign(designToken, appId, verifier)).designId,
    "design",
  );
});

test("rejects missing/malformed bearer auth", () => {
  for (const header of [
    undefined,
    "",
    "Basic abc",
    "Bearer abc",
    "Bearer a.b.c more",
  ])
    assert.throws(() => bearerToken(header), status(401));
  assert.equal(bearerToken(`Bearer ${userToken}`), userToken);
});

test("rejects forged, expired, wrong audience, missing-claim and future tokens", async () => {
  const now = Math.floor(Date.now() / 1000);
  for (const candidate of [
    token({ userId: "owner", brandId: "team" }, true),
    token({ userId: "owner", brandId: "team", exp: now - 10 }),
    token({ userId: "owner", brandId: "team", aud: "wrong" }),
    token({ userId: "owner" }),
    token({ userId: "owner", brandId: "team", nbf: now + 100 }),
  ])
    await assert.rejects(
      authorizeCanvaUser(candidate, appId, ["owner"], verifier),
      status(401),
    );
  for (const candidate of [
    token({ designId: "design" }, true),
    token({ designId: "design", exp: now - 10 }),
    token({ designId: "design", aud: "wrong" }),
    token({ userId: "owner", brandId: "team" }),
  ]) {
    await assert.rejects(verifyDesign(candidate, appId, verifier), status(401));
  }
});

test("fails closed for unconfigured and unauthorized users", async () => {
  await assert.rejects(
    authorizeCanvaUser(userToken, appId, [], verifier),
    status(503),
  );
  await assert.rejects(
    authorizeCanvaUser(userToken, appId, ["somebody-else"], verifier),
    status(403),
  );
});

test("local test access still verifies the Canva token and returns the actual owner ID", async () => {
  const user = await authorizeCanvaUser(userToken, appId, [], verifier, true);
  assert.equal(user.userId, "owner");
  await assert.rejects(
    authorizeCanvaUser(
      token({ userId: "owner", brandId: "team" }, true),
      appId,
      [],
      verifier,
      true,
    ),
    status(401),
  );
  await assert.rejects(
    authorizeCanvaUser(userToken, "", [], verifier, true),
    status(503),
  );
});
