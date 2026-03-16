import { Command } from "commander";
import { loadCredentials } from "../auth.js";
import { callApi } from "../api.js";
import { output, fatal } from "../utils.js";

export function registerReportCommands(program: Command): void {
  program
    .command("report <campaign-id>")
    .description("Get campaign-level performance report")
    .requiredOption("--start-date <date>", "Start date (YYYY-MM-DD)")
    .requiredOption("--end-date <date>", "End date (YYYY-MM-DD)")
    .option("--granularity <gran>", "Granularity: HOURLY, DAILY, WEEKLY, MONTHLY (default DAILY)", "DAILY")
    .option("--group-by <fields>", "Group by fields (comma-separated, e.g. countryOrRegion,deviceClass)")
    .option("--return-records-with-no-metrics", "Include records with no metrics")
    .action(async (campaignId: string, opts) => {
      try {
        const creds = loadCredentials(program.opts().credentials);
        const body: Record<string, unknown> = {
          startTime: opts.startDate,
          endTime: opts.endDate,
          granularity: opts.granularity,
          returnRecordsWithNoMetrics: opts.returnRecordsWithNoMetrics ?? false,
        };
        if (opts.groupBy) {
          body.groupBy = opts.groupBy.split(",").map((s: string) => s.trim());
        }
        const data = await callApi(
          `/reports/campaigns/${campaignId}`,
          { creds, method: "POST", body }
        );
        output(data, program.opts().format);
      } catch (err) {
        fatal((err as Error).message);
      }
    });

  program
    .command("report-adgroups <campaign-id>")
    .description("Get ad group-level performance report")
    .requiredOption("--start-date <date>", "Start date (YYYY-MM-DD)")
    .requiredOption("--end-date <date>", "End date (YYYY-MM-DD)")
    .option("--granularity <gran>", "Granularity: HOURLY, DAILY, WEEKLY, MONTHLY (default DAILY)", "DAILY")
    .action(async (campaignId: string, opts) => {
      try {
        const creds = loadCredentials(program.opts().credentials);
        const body: Record<string, unknown> = {
          startTime: opts.startDate,
          endTime: opts.endDate,
          granularity: opts.granularity,
        };
        const data = await callApi(
          `/reports/campaigns/${campaignId}/adgroups`,
          { creds, method: "POST", body }
        );
        output(data, program.opts().format);
      } catch (err) {
        fatal((err as Error).message);
      }
    });

  program
    .command("report-keywords <campaign-id>")
    .description("Get keyword-level performance report")
    .requiredOption("--start-date <date>", "Start date (YYYY-MM-DD)")
    .requiredOption("--end-date <date>", "End date (YYYY-MM-DD)")
    .option("--granularity <gran>", "Granularity: HOURLY, DAILY, WEEKLY, MONTHLY (default DAILY)", "DAILY")
    .action(async (campaignId: string, opts) => {
      try {
        const creds = loadCredentials(program.opts().credentials);
        const body: Record<string, unknown> = {
          startTime: opts.startDate,
          endTime: opts.endDate,
          granularity: opts.granularity,
        };
        const data = await callApi(
          `/reports/campaigns/${campaignId}/keywords`,
          { creds, method: "POST", body }
        );
        output(data, program.opts().format);
      } catch (err) {
        fatal((err as Error).message);
      }
    });
}
