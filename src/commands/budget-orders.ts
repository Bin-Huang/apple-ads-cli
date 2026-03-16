import { Command } from "commander";
import { loadCredentials } from "../auth.js";
import { callApi } from "../api.js";
import { output, fatal } from "../utils.js";

export function registerBudgetOrderCommands(program: Command): void {
  program
    .command("budget-orders")
    .description("List all budget orders for the organization")
    .option("--limit <n>", "Number of results (default 20)", "20")
    .option("--offset <n>", "Offset for pagination (default 0)", "0")
    .action(async (opts) => {
      try {
        const creds = loadCredentials(program.opts().credentials);
        const params: Record<string, string> = {
          limit: opts.limit,
          offset: opts.offset,
        };
        const data = await callApi("/budgetorders", { creds, params });
        output(data, program.opts().format);
      } catch (err) {
        fatal((err as Error).message);
      }
    });

  program
    .command("budget-order <budget-order-id>")
    .description("Get a specific budget order by ID")
    .action(async (budgetOrderId: string) => {
      try {
        const creds = loadCredentials(program.opts().credentials);
        const data = await callApi(`/budgetorders/${budgetOrderId}`, { creds });
        output(data, program.opts().format);
      } catch (err) {
        fatal((err as Error).message);
      }
    });
}
