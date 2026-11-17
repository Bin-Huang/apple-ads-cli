import { Command, CommanderError } from "commander";
import type { Deps } from "./context.js";
import { API_NAME, VERSION } from "./constants.js";
import { CliError, ExitCode, toCliError } from "./errors.js";
import { Out } from "./output.js";
import { registerAuth } from "./commands/auth.js";
import { registerAccount } from "./commands/account.js";
import { registerApps } from "./commands/apps.js";
import { registerCampaigns } from "./commands/campaigns.js";
import { registerAdGroups } from "./commands/ad-groups.js";
import { registerKeywords } from "./commands/keywords.js";
import { registerNegatives } from "./commands/negatives.js";
import { registerCreatives } from "./commands/creatives.js";
import { registerAds } from "./commands/ads.js";
import { registerReports } from "./commands/reports.js";
import { registerHistory, registerInsights } from "./commands/insights.js";
import { registerSchema } from "./commands/schema.js";
import { registerApi } from "./commands/api.js";
import { EXIT_CODES_HELP } from "./commands/shared.js";

export function buildProgram(deps: Deps): Command {
  const program = new Command();
  program
    .name("apple-ads-cli")
    .description(`Apple Ads (App Store) campaigns, keywords and reports on the ${API_NAME}. JSON on stdout; errors as JSON on stderr.`)
    .version(VERSION, "-V, --version", "print the version")
    .option("--profile <name>", "config profile (env APPLE_ADS_PROFILE)")
    .option("--ad-account-id <id>", "ad account ID (env APPLE_ADS_AD_ACCOUNT_ID)")
    .option("--output <format>", "json (default) or table")
    .option("--pretty", "indented JSON (default when stdout is a terminal)")
    .option("--debug", "log requests to stderr with secrets redacted")
    .option("--config <path>", "config file (env APPLE_ADS_CONFIG)")
    .option("--timeout <seconds>", "request timeout (default 60)")
    .exitOverride()
    .showSuggestionAfterError(true)
    .configureOutput({ writeOut: deps.stdout, writeErr: deps.stderr, outputError: () => {} })
    .addHelpText(
      "after",
      [
        "",
        "Writes never send without --confirm; use --dry-run to see the exact request first.",
        "Docs: https://developer.apple.com/documentation/apple-ads-platform-api",
        "Repository: https://github.com/Bin-Huang/apple-ads-cli",
        EXIT_CODES_HELP,
      ].join("\n"),
    );
  registerAuth(program, deps);
  registerAccount(program, deps);
  registerApps(program, deps);
  registerCampaigns(program, deps);
  registerAdGroups(program, deps);
  registerKeywords(program, deps);
  registerNegatives(program, deps);
  registerCreatives(program, deps);
  registerAds(program, deps);
  registerReports(program, deps);
  registerInsights(program, deps);
  registerHistory(program, deps);
  registerSchema(program, deps);
  registerApi(program, deps);
  return program;
}

/** Parses argv and runs one command. Returns the exit code; never calls process.exit. */
export async function run(argv: string[], deps: Deps): Promise<number> {
  const debug = argv.includes("--debug") || deps.env.APPLE_ADS_DEBUG === "1";
  const out = new Out({ stdout: deps.stdout, stderr: deps.stderr, format: "json", pretty: false, debug });
  try {
    await buildProgram(deps).parseAsync(argv, { from: "user" });
    return ExitCode.OK;
  } catch (e) {
    if (e instanceof CommanderError) {
      if (e.code === "commander.helpDisplayed" || e.code === "commander.version" || e.exitCode === 0) return ExitCode.OK;
      if (e.code === "commander.help" || e.code === "commander.executeSubCommandAsync") return ExitCode.USAGE;
      const msg = e.message.replace(/^error:\s*/i, "");
      out.error(new CliError({ exitCode: ExitCode.USAGE, code: "USAGE", message: msg, hint: "run with --help for usage" }));
      return ExitCode.USAGE;
    }
    const err = toCliError(e);
    out.error(err, (e as Error)?.stack);
    return err.exitCode;
  }
}
