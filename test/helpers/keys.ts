import { generateKeyPairSync, type KeyObject } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

/** Writes a freshly generated EC private key (test only) and returns its path and public key. */
export function writeKey(dir: string, curve = "prime256v1", mode = 0o600): { path: string; publicKey: KeyObject } {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: curve });
  const path = join(dir, `key-${curve}.pem`);
  writeFileSync(path, privateKey.export({ type: "sec1", format: "pem" }), { mode });
  return { path, publicKey };
}
