import { createPrivateKey, sign, type KeyObject } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { AUDIENCE, CLIENT_SECRET_TTL_S } from "../constants.js";
import { authError } from "../errors.js";
import { isKeyContent } from "../config.js";

export interface SecretInput {
  clientId: string;
  teamId: string;
  keyId: string;
  privateKeyPath: string;
  /** Seconds since the epoch. */
  now?: number;
  ttlSeconds?: number;
}

export function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/** Reads the key file and checks it is an EC P-256 private key. The PEM is not kept. */
export function loadPrivateKey(path: string): KeyObject {
  if (isKeyContent(path)) throw authError("The private key setting holds key contents, not a file path", "save the key to a file with mode 600 and set the path instead", "KEY_IS_CONTENT");
  if (!existsSync(path)) throw authError(`Private key file not found: ${path}`, "check privateKeyPath in the profile", "KEY_NOT_FOUND");
  let key: KeyObject;
  try {
    key = createPrivateKey(readFileSync(path));
  } catch (e) {
    throw authError(`Private key file ${path} could not be parsed: ${(e as Error).message}`, "the file must be a PEM EC private key", "KEY_INVALID");
  }
  if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") {
    throw authError(
      `Private key ${path} is not an EC P-256 key`,
      "generate one with: openssl ecparam -genkey -name prime256v1 -noout -out private-key.pem",
      "KEY_INVALID",
    );
  }
  return key;
}

export function keyFileIsLoose(path: string): boolean {
  try {
    return (statSync(path).mode & 0o077) !== 0;
  } catch {
    return false;
  }
}

/** Builds the ES256 client-secret JWT Apple's token endpoint expects. */
export function makeClientSecret(input: SecretInput): string {
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: input.keyId, typ: "JWT" };
  const claims = {
    sub: input.clientId,
    iss: input.teamId,
    aud: AUDIENCE,
    iat: now,
    exp: now + (input.ttlSeconds ?? CLIENT_SECRET_TTL_S),
  };
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const signature = sign("sha256", Buffer.from(data), { key: loadPrivateKey(input.privateKeyPath), dsaEncoding: "ieee-p1363" });
  return `${data}.${b64url(signature)}`;
}
