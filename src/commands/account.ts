import type { Command } from "commander";
import { act, type Deps } from "../context.js";
import { RESOURCES } from "../resources.js";
import { filter, type Filter } from "../query.js";
import { addListFlags, doc, idArg, listEntities, registerGet } from "./shared.js";

export function registerAccount(program: Command, deps: Deps): void {
  doc(
    program
      .command("me")
      .description("Show the API user (userId, orgId)")
      .action(act(deps, async (ctx) => ctx.out.emit({ result: (await ctx.client.request({ method: "GET", path: "/me", context: "none" })).json?.result ?? null }))),
    { endpoint: "GET /v1/me", examples: ["apple-ads-cli me"] },
  );

  doc(
    program
      .command("access")
      .description("List the ad accounts and roles these credentials can use")
      .action(
        act(deps, async (ctx) => {
          const acls: any[] = (await ctx.client.request({ method: "GET", path: "/acls", context: "none" })).json?.result?.acls ?? [];
          ctx.out.emit(
            { result: acls.map((a) => ({ adAccountId: a?.adAccount?.id, name: a?.adAccount?.name, orgId: a?.adAccount?.orgId, roles: a?.roles ?? [] })) },
            [
              { header: "adAccountId", path: "adAccountId" },
              { header: "name", path: "name" },
              { header: "orgId", path: "orgId" },
              { header: "roles", path: "roles" },
            ],
          );
        }),
      ),
    { endpoint: "GET /v1/acls", schema: "UserAcl", examples: ["apple-ads-cli access"] },
  );

  const accounts = program.command("accounts").description("Ad account details");
  doc(
    accounts
      .command("get")
      .description("Currency, time zone, payment model and status of an ad account (default: the active one)")
      .argument("[id]", "ad account ID", idArg("ad account ID"))
      .action(
        act(deps, async (ctx, _o, [id]) => {
          const aid = id ?? (await ctx.adAccountId());
          const r = await ctx.client.request({ method: "GET", path: `/ad-accounts/${aid}` });
          ctx.out.emit({ result: r.json?.result ?? null });
        }),
      ),
    { endpoint: "GET /v1/ad-accounts/{id}", schema: "AdAccount", examples: ["apple-ads-cli accounts get", "apple-ads-cli accounts get 123456789"] },
  );

  const orgs = program.command("orgs").description("Organization details");
  doc(
    orgs
      .command("get")
      .description("Get an organization by ID")
      .argument("<id>", "org ID", idArg("org ID"))
      .action(act(deps, async (ctx, _o, [id]) => ctx.out.emit({ result: (await ctx.client.request({ method: "GET", path: `/orgs/${id}`, context: "none" })).json?.result ?? null }))),
    { endpoint: "GET /v1/orgs/{id}", schema: "Org", examples: ["apple-ads-cli orgs get 987654321"] },
  );

  const bo = program.command("budget-orders").description("Budget orders (shared budgets), read-only");
  const list = addListFlags(bo.command("list").description("List budget orders"), "entity")
    .option("--status <status>", "systemStatus: ACTIVE or INACTIVE")
    .action(
      act(deps, async (ctx, o) => {
        const f: Filter[] = [];
        if (o.status) f.push(filter("systemStatus", "EQUALS", o.status.toUpperCase()));
        await listEntities(ctx, RESOURCES.budgetOrders, o, f);
      }),
    );
  doc(list, { endpoint: "POST /v1/shared-budgets/query", schema: "QueryRequest -> SharedBudget[]", examples: ["apple-ads-cli budget-orders list"], notes: ["writes are not offered; use `api` with --confirm if you must"] });
  registerGet(bo, deps, RESOURCES.budgetOrders);
}
