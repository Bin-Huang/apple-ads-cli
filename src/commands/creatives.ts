import type { Command } from "commander";
import { act, type Ctx, type Deps } from "../context.js";
import { usageError } from "../errors.js";
import { runPlan } from "../mutate.js";
import { filter, paginate, type Filter } from "../query.js";
import { RESOURCES } from "../resources.js";
import { combine, reason } from "../spend.js";
import type { Target } from "../guard.js";
import { PAGE_MAX_ENTITY } from "../constants.js";
import { addListFlags, addWriteFlags, deepMerge, doc, getOne, listEntities, readOverlay, registerDelete, registerGet, statusFields } from "./shared.js";

const R = RESOURCES.creatives;

export function buildCreativeBody(name: string, adamId: string, productPageId?: string): Record<string, unknown> {
  if (!/^\d+$/.test(adamId)) throw usageError("--adam-id must be the numeric App Store app ID");
  if (!name.trim()) throw usageError("--name must not be empty");
  const parameters: Record<string, string> = { adamId };
  if (productPageId) parameters.productPageId = productPageId;
  return {
    name,
    creativeType: productPageId ? "CUSTOM_PRODUCT_PAGE" : "DEFAULT_PRODUCT_PAGE",
    destination: { destinationType: "APP_STORE_PRODUCT_PAGE", parameters },
  };
}

/** A creative belongs to no campaign; its targets are the campaigns of ads that use it. */
export async function creativeTargets(ctx: Ctx, id: string): Promise<Target[]> {
  const ads = await paginate(ctx.client, { path: RESOURCES.ads.queryPath, body: { filters: [filter("creativeId", "EQUALS", id)] }, pageMax: PAGE_MAX_ENTITY, limit: 0, all: true, offset: 0 });
  const t: Target[] = [{ type: "creative", id }];
  for (const a of ads.rows as any[]) t.push({ type: "ad", id: String(a.id), campaignId: String(a.campaignId) });
  return t;
}

export function registerCreatives(program: Command, deps: Deps): void {
  const g = program.command("creatives").description("List, inspect and create creatives (product page destinations)");

  const list = addListFlags(g.command("list").description("List creatives"), "entity")
    .option("--type <type>", "CUSTOM_PRODUCT_PAGE or DEFAULT_PRODUCT_PAGE")
    .option("--status <status>", "systemStatus: VALID, INVALID or PENDING")
    .action(
      act(deps, async (ctx, o) => {
        const f: Filter[] = [];
        if (o.type) f.push(filter("creativeType", "EQUALS", o.type.toUpperCase()));
        if (o.status) f.push(filter("systemStatus", "EQUALS", o.status.toUpperCase()));
        await listEntities(ctx, R, o, f);
      }),
    );
  doc(list, { endpoint: "POST /v1/creatives/query", schema: "QueryRequest -> Creative[]", examples: ["apple-ads-cli creatives list --status VALID"] });

  registerGet(g, deps, R);

  const create = g
    .command("create")
    .description("Create a creative for the default or a custom product page")
    .requiredOption("--name <name>", "creative name")
    .requiredOption("--adam-id <id>", "App Store app ID")
    .option("--product-page-id <uuid>", "custom product page ID (from product-pages list); omit for the default page")
    .option("--allow-duplicate", "create even if a creative with this name exists");
  addWriteFlags(create);
  create.action(
    act(deps, async (ctx, o) => {
      if (o.productPageId) {
        const r = await ctx.client.request({ method: "GET", path: `/product-pages/${o.productPageId}` });
        const state = r.json?.result?.state;
        if (state && state !== "VISIBLE") throw usageError(`Product page ${o.productPageId} is ${state}, not VISIBLE`, "publish the custom product page in App Store Connect first");
      }
      const flagsBody = buildCreativeBody(o.name, o.adamId, o.productPageId);
      const overlay = await readOverlay(ctx, o);
      const body = overlay ? deepMerge(overlay, flagsBody) : flagsBody;
      const dup = await ctx.client.request({ method: "POST", path: R.queryPath, body: { filters: [filter("name", "EQUALS", String(body.name))], pagination: { offset: 0, pageSize: 10 } } });
      const existing = (dup.json?.result ?? []).map((c: any) => ({ id: c.id, name: c.name, creativeType: c.creativeType, systemStatus: c.systemStatus }));
      const skip = existing.length > 0 && !o.allowDuplicate;
      await runPlan(
        ctx,
        {
          action: "creatives.create",
          steps: skip ? [] : [{ method: "POST", path: R.path, body }],
          targets: [{ type: "creative" }],
          existing,
          spend: combine([reason("none", "a creative alone does not serve; an ad links it to an ad group")]),
          verify: async (res) => (res[0]?.id ? [statusFields(await getOne(ctx, R, String(res[0].id)))] : []),
          summary: `creative "${body.name}" created`,
        },
        o,
      );
    }),
  );
  doc(create, {
    endpoint: "POST /v1/creatives",
    schema: "CreativeCreate",
    examples: ["apple-ads-cli creatives create --name 'Example CPP' --adam-id 1234567890 --product-page-id 00000000-0000-0000-0000-000000000000 --dry-run"],
    notes: ["creatives cannot be changed after creation"],
  });

  registerDelete(g, deps, R, (ctx, id) => creativeTargets(ctx, id));
}
