import { test } from "node:test";
import assert from "node:assert/strict";
import { verify } from "node:crypto";
import { makeClientSecret, loadPrivateKey } from "../src/auth/jwt.js";
import { tempHome } from "./helpers/cli.js";
import { writeKey } from "./helpers/keys.js";

const dec = (s: string) => JSON.parse(Buffer.from(s, "base64url").toString("utf8"));

test("client secret: ES256 header, claims and a verifiable P1363 signature", () => {
  const { path, publicKey } = writeKey(tempHome());
  const jwt = makeClientSecret({ clientId: "SEARCHADS.client", teamId: "SEARCHADS.team", keyId: "key-1", privateKeyPath: path, now: 1_800_000_000 });
  const [h, c, s] = jwt.split(".");
  assert.deepEqual(dec(h!), { alg: "ES256", kid: "key-1", typ: "JWT" });
  const claims = dec(c!);
  assert.deepEqual(claims, { sub: "SEARCHADS.client", iss: "SEARCHADS.team", aud: "https://appleid.apple.com", iat: 1_800_000_000, exp: 1_800_000_600 });
  assert.equal(claims.exp - claims.iat, 600);
  const sig = Buffer.from(s!, "base64url");
  assert.equal(sig.length, 64, "raw R||S, not DER");
  assert.ok(verify("sha256", Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, sig));
});

test("a non-P-256 key is rejected with exit 3", () => {
  const { path } = writeKey(tempHome(), "secp384r1");
  assert.throws(() => loadPrivateKey(path), (e: any) => e.exitCode === 3 && /P-256/.test(e.message));
});

test("a missing key file is an auth error", () => {
  assert.throws(() => loadPrivateKey("/nonexistent/key.pem"), (e: any) => e.exitCode === 3 && e.code === "KEY_NOT_FOUND");
});
