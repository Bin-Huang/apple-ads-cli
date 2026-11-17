import type { Command } from "commander";
import { act, type Deps } from "../context.js";
import { API_BASE, API_NAME, VERSION } from "../constants.js";
import { usageError } from "../errors.js";
import { ENUMS, FILTERS } from "../schema-data.js";
import { COUNT_METRICS, GROUP_BY, METRICS, REPORT_PATH } from "./reports.js";
import { DOCS } from "./shared.js";

export const EXIT_CODES = [
  { code: 0, meaning: "OK (including --dry-run)" },
  { code: 1, meaning: "API or runtime error (4xx validation; partial bulk failure)" },
  { code: 2, meaning: "Usage error: bad flag or local validation failure" },
  { code: 3, meaning: "Auth or config error (no profile, key unreadable, token exchange failed, 401/403)" },
  { code: 4, meaning: "Not found (404 / ENTITY_NOT_FOUND)" },
  { code: 5, meaning: "Rate limited or transient: retries ran out on 429, 5xx, timeout or network error" },
  { code: 6, meaning: "Refused for safety: CONFIRM_REQUIRED, PROTECTED, FORCE_DELETE_REQUIRED or ABOVE_CEILING" },
];

function tree(cmd: Command, prefix: string[] = []): unknown[] {
  const out: unknown[] = [];
  for (const c of cmd.commands) {
    const path = [...prefix, c.name()];
    if (c.commands.length) out.push(...tree(c, path));
    else {
      const d = DOCS.get(c);
      out.push({
        command: path.join(" "),
        description: c.description(),
        arguments: c.registeredArguments.map((a) => ({ name: a.name(), required: a.required, variadic: a.variadic })),
        options: c.options.map((o) => ({ flags: o.flags, description: o.description, ...(o.mandatory ? { required: true } : {}) })),
        ...(d ? { endpoint: d.endpoint, schema: d.schema, examples: d.examples } : {}),
      });
    }
  }
  return out;
}

export function registerSchema(program: Command, deps: Deps): void {
  const cmd = program
    .command("schema")
    .description("Offline reference: commands, filters, reports, enums, exit codes")
    .argument("[topic]", "commands | filters | reports | enums | exit-codes")
    .argument("[name]", "resource for filters, enum name for enums")
    .action(
      act(deps, async (ctx, _o, [topic, name]) => {
        switch (topic ?? "") {
          case "":
            return ctx.out.emit({ result: { version: VERSION, api: API_NAME, base: API_BASE, topics: ["commands", "filters", "reports", "enums", "exit-codes"] } });
          case "commands":
            return ctx.out.emit({ result: tree(program) });
          case "filters":
            if (!name) return ctx.out.emit({ result: Object.fromEntries(Object.entries(FILTERS).map(([k, v]) => [k, v.endpoint])) });
            if (!FILTERS[name]) throw usageError(`No filter table for "${name}"`, `use one of ${Object.keys(FILTERS).join(", ")}`);
            return ctx.out.emit({ result: FILTERS[name] });
          case "reports":
            return ctx.out.emit({
              result: {
                kinds: Object.fromEntries(Object.entries(REPORT_PATH).map(([k, p]) => [k, { endpoint: `POST /v1${p}`, groupBy: GROUP_BY[k as keyof typeof GROUP_BY], requires: k === "campaigns" ? "optional --campaign-id (id IN)" : "--campaign-id (campaignId EQUALS)" }])),
                metrics: METRICS,
                countMetricsDefaultedToZero: COUNT_METRICS,
                granularity: { HOURLY: "span <= 7 days, start within 365 days; not for ads or search-terms", DAILY: "span <= 90 days", WEEKLY: "span >= 14 days", MONTHLY: "span >= 90 days", omitted: "totals only" },
                timeZone: { ORTZ: "account time zone (default)", UTC: "not for search-terms" },
                includeRows: { GRAND_TOTAL: "default on", EMPTY_METRICS: "--include-empty; not with --group-by, not for search-terms" },
                pageSizeMax: 5000,
              },
            });
          case "enums":
            if (!name) return ctx.out.emit({ result: Object.keys(ENUMS) });
            if (!ENUMS[name.toLowerCase()]) throw usageError(`No enum "${name}"`, "run `apple-ads-cli schema enums` for the list");
            return ctx.out.emit({ result: { [name.toLowerCase()]: ENUMS[name.toLowerCase()] } });
          case "exit-codes":
            return ctx.out.emit({ result: EXIT_CODES });
          default:
            throw usageError(`Unknown schema topic "${topic}"`, "use commands, filters, reports, enums or exit-codes");
        }
      }),
    );
  DOCS.set(cmd, { endpoint: "none (offline)", examples: ["apple-ads-cli schema commands", "apple-ads-cli schema filters keywords", "apple-ads-cli schema exit-codes"] });
  cmd.addHelpText("after", "\nEndpoint: none (offline; no network)\n\nExamples:\n  apple-ads-cli schema filters keywords\n  apple-ads-cli schema reports\n  apple-ads-cli schema exit-codes");
}
