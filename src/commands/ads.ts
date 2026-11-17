import type { Command } from "commander";
import { act, type Deps } from "../context.js";
import { usageError } from "../errors.js";
import { runPlan } from "../mutate.js";
import { filter, type Filter } from "../query.js";
import { RESOURCES } from "../resources.js";
import { combine, createReason, nameReason } from "../spend.js";
import { addListFlags, addWriteFlags, deepMerge, doc, getOne, idArg, listEntities, readOverlay, registerDelete, registerGet, registerStatus, statusFields } from "./shared.js";

const R = RESOURCES.ads;

export function buildAdBody(campaignId: string, adGroupId: string, creativeId: string, name: string, status = "PAUSED"): Record<string, unknown> {
  const st = status.toUpperCase();
  if (st !== "PAUSED" && st !== "ENABLED") throw usageError("--status must be PAUSED or ENABLED");
  if (!name.trim()) throw usageError("--name must not be empty");
  // campaignId is included because the request that worked had it.
  return { campaignId: Number(campaignId), adGroupId: Number(adGroupId), creativeId: Number(creativeId), name, status: st };
}

export function registerAds(program: Command, deps: Deps): void {
  const g = program.command("ads").description("List, create and change ads (a creative placed in an ad group)");

  const list = addListFlags(g.command("list").description("List ads"), "entity")
    .option("--campaign-id <id>", "ads in this campaign", idArg("--campaign-id"))
    .option("--ad-group-id <id>", "ads in this ad group", idArg("--ad-group-id"))
    .option("--status <status>", "ENABLED or PAUSED")
    .action(
      act(deps, async (ctx, o) => {
        const f: Filter[] = [];
        if (o.campaignId) f.push(filter("campaignId", "EQUALS", o.campaignId));
        if (o.adGroupId) f.push(filter("adGroupId", "EQUALS", o.adGroupId));
        if (o.status) f.push(filter("status", "EQUALS", o.status.toUpperCase()));
        await listEntities(ctx, R, o, f);
      }),
    );
  doc(list, { endpoint: "POST /v1/ads/query", schema: "QueryRequest -> Ad[]", examples: ["apple-ads-cli ads list --campaign-id 111111111"] });

  registerGet(g, deps, R);

  const create = g
    .command("create")
    .description("Create an ad from a VALID creative (PAUSED unless --status ENABLED)")
    .requiredOption("--ad-group-id <id>", "ad group", idArg("--ad-group-id"))
    .requiredOption("--creative-id <id>", "creative", idArg("--creative-id"))
    .requiredOption("--name <name>", "ad name")
    .option("--status <status>", "PAUSED (default) or ENABLED")
    .option("--allow-duplicate", "create even if the ad group has an ad with this name");
  addWriteFlags(create);
  create.action(
    act(deps, async (ctx, o) => {
      const adGroup = await getOne(ctx, RESOURCES.adGroups, o.adGroupId);
      const creative = await getOne(ctx, RESOURCES.creatives, o.creativeId);
      if (creative?.systemStatus && creative.systemStatus !== "VALID") {
        throw usageError(`Creative ${o.creativeId} is ${creative.systemStatus}, not VALID`, `see systemStatusReasons: ${(creative.systemStatusReasons ?? []).join(", ") || "none"}`);
      }
      const campaignId = String(adGroup.campaignId);
      const flagsBody = buildAdBody(campaignId, o.adGroupId, o.creativeId, o.name, o.status);
      const overlay = await readOverlay(ctx, o);
      const body = overlay ? deepMerge(overlay, flagsBody) : flagsBody;
      const dup = await ctx.client.request({
        method: "POST",
        path: R.queryPath,
        body: { filters: [filter("adGroupId", "EQUALS", o.adGroupId)], pagination: { offset: 0, pageSize: 1000 } },
      });
      const existing = (dup.json?.result ?? []).filter((a: any) => a.name === body.name).map(statusFields);
      const skip = existing.length > 0 && !o.allowDuplicate;
      await runPlan(
        ctx,
        {
          action: "ads.create",
          steps: skip ? [] : [{ method: "POST", path: R.path, body }],
          targets: [{ type: "ad", campaignId }],
          existing,
          spend: combine([createReason("ad", String(body.status), adGroup?.displayStatus === "RUNNING")]),
          verify: async (res) => (res[0]?.id ? [statusFields(await getOne(ctx, R, String(res[0].id)))] : []),
          summary: `ad "${body.name}" created ${body.status}`,
        },
        o,
      );
    }),
  );
  doc(create, { endpoint: "POST /v1/ads", schema: "AdCreate", examples: ["apple-ads-cli ads create --ad-group-id 222222222 --creative-id 666666 --name 'Example Ad' --dry-run"] });

  const update = g
    .command("update")
    .description("Rename an ad")
    .argument("<id>", "ad ID", idArg("ad ID"))
    .requiredOption("--name <name>", "new name");
  addWriteFlags(update);
  update.action(
    act(deps, async (ctx, o, [id]) => {
      const before = await getOne(ctx, R, id!);
      const overlay = await readOverlay(ctx, o);
      const body = overlay ? deepMerge(overlay, { name: o.name }) : { name: o.name };
      await runPlan(
        ctx,
        {
          action: "ads.update",
          steps: [{ method: "PUT", path: `${R.path}/${id}`, body }],
          targets: [{ type: "ad", id, campaignId: String(before.campaignId) }],
          before: statusFields(before),
          changes: [{ field: "name", before: before.name, after: o.name }],
          spend: combine([nameReason("ad", id!)]),
          verify: async () => [statusFields(await getOne(ctx, R, id!))],
          summary: `ad ${id} renamed`,
        },
        o,
      );
    }),
  );
  doc(update, { endpoint: "PUT /v1/ads/{id}", schema: "AdUpdate", examples: ["apple-ads-cli ads update 555555555 --name 'Example Ad 2' --dry-run"] });

  registerStatus(g, deps, R, "pause");
  registerStatus(g, deps, R, "resume");
  registerDelete(g, deps, R);
}
