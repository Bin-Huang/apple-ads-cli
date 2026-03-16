import { Command } from "commander";
import { loadCredentials } from "../auth.js";
import { callApi } from "../api.js";
import { output, fatal } from "../utils.js";

export function registerKeywordCommands(program: Command): void {
  program
    .command("keywords <campaign-id> <adgroup-id>")
    .description("List targeting keywords for an ad group")
    .option("--limit <n>", "Number of results (default 20)", "20")
    .option("--offset <n>", "Offset for pagination (default 0)", "0")
    .action(async (campaignId: string, adgroupId: string, opts) => {
      try {
        const creds = loadCredentials(program.opts().credentials);
        const params: Record<string, string> = {
          limit: opts.limit,
          offset: opts.offset,
        };
        const data = await callApi(
          `/campaigns/${campaignId}/adgroups/${adgroupId}/targetingkeywords`,
          { creds, params }
        );
        output(data, program.opts().format);
      } catch (err) {
        fatal((err as Error).message);
      }
    });
}
