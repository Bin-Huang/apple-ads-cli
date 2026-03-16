import { Command } from "commander";
import { loadCredentials } from "../auth.js";
import { callApi } from "../api.js";
import { output, fatal } from "../utils.js";

export function registerAppCommands(program: Command): void {
  program
    .command("search-apps <query>")
    .description("Search for iOS apps to promote in a campaign")
    .option("--return-own-apps", "Only return apps owned by the organization")
    .option("--limit <n>", "Number of results (default 20)", "20")
    .option("--offset <n>", "Offset for pagination (default 0)", "0")
    .action(async (query: string, opts) => {
      try {
        const creds = loadCredentials(program.opts().credentials);
        const params: Record<string, string> = {
          query,
          limit: opts.limit,
          offset: opts.offset,
        };
        if (opts.returnOwnApps) params.returnOwnedApps = "true";
        const data = await callApi("/search/apps", { creds, params });
        output(data, program.opts().format);
      } catch (err) {
        fatal((err as Error).message);
      }
    });

  program
    .command("app-eligibility <adam-id>")
    .description("Check if an app is eligible to promote in a campaign")
    .action(async (adamId: string) => {
      try {
        const creds = loadCredentials(program.opts().credentials);
        const data = await callApi(`/apps/${adamId}/eligibilities`, { creds });
        output(data, program.opts().format);
      } catch (err) {
        fatal((err as Error).message);
      }
    });

  program
    .command("app <adam-id>")
    .description("Get app details by Adam ID")
    .action(async (adamId: string) => {
      try {
        const creds = loadCredentials(program.opts().credentials);
        const data = await callApi(`/apps/${adamId}`, { creds });
        output(data, program.opts().format);
      } catch (err) {
        fatal((err as Error).message);
      }
    });
}
