import assert from "node:assert/strict";

const V5_KEYS = ["conditions", "values", "limit", "selector", "orderBy"];
export function assertNoV5Keys(body: unknown, where = "body"): void {
  const walk = (v: unknown, path: string) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${i}]`));
    for (const [k, x] of Object.entries(v)) {
      assert.ok(!V5_KEYS.includes(k), `${where}: v5 key "${k}" at ${path}`);
      walk(x, `${path}.${k}`);
    }
  };
  walk(body, "$");
}

