#!/usr/bin/env node
import { Command } from "commander";
import { registerAclCommands } from "./commands/acl.js";
import { registerAppCommands } from "./commands/apps.js";
import { registerCampaignCommands } from "./commands/campaigns.js";
import { registerBudgetOrderCommands } from "./commands/budget-orders.js";
import { registerAdgroupCommands } from "./commands/adgroups.js";
import { registerAdCommands } from "./commands/ads.js";
import { registerKeywordCommands } from "./commands/keywords.js";
import { registerNegativeKeywordCommands } from "./commands/negative-keywords.js";
import { registerReportCommands } from "./commands/report.js";

const program = new Command();

program
  .name("apple-ads-cli")
  .description("Apple Ads CLI for AI agents")
  .version("1.0.0")
  .option("--format <format>", "Output format", "json")
  .option("--credentials <path>", "Path to credentials JSON file")
  .addHelpText(
    "after",
    "\nDocs: https://github.com/Bin-Huang/apple-ads-cli"
  );

program.configureOutput({
  writeErr: () => {},
});

program.hook("preAction", () => {
  const format = program.opts().format;
  if (format !== "json" && format !== "compact") {
    process.stderr.write(
      JSON.stringify({ error: "Format must be 'json' or 'compact'." }) + "\n"
    );
    process.exit(1);
  }
});

registerAclCommands(program);
registerAppCommands(program);
registerCampaignCommands(program);
registerBudgetOrderCommands(program);
registerAdgroupCommands(program);
registerAdCommands(program);
registerKeywordCommands(program);
registerNegativeKeywordCommands(program);
registerReportCommands(program);

if (process.argv.length <= 2) {
  program.outputHelp();
  process.exit(0);
}

program.parse();
