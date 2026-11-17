import type { Command } from "commander";
import { act, type Deps } from "../context.js";
import { usageError } from "../errors.js";
import { PAGE_MAX_ENTITY } from "../constants.js";
import { buildQuery, filter, paginate, parseFields, parseSort, type Filter } from "../query.js";
import { addListFlags, doc, extraFilters, idArg, listOpts, truncationNote } from "./shared.js";

const collect = (v: string, prev: string[] = []) => [...prev, v];

export function registerApps(program: Command, deps: Deps): void {
  const apps = program.command("apps").description("Find apps, check ad eligibility and read app details");

  doc(
    apps
      .command("search")
      .description("Search the App Store, or list apps you own")
      .option("--query <text>", "app name (3+ characters)")
      .option("--owned", "only apps this account can promote")
      .option("--storefront <code>", "storefront country code (repeatable)", collect)
      .option("--limit <n>", "maximum results", (v) => Number(v), 20)
      .option("--offset <n>", "start at this row", (v) => Number(v), 0)
      .action(
        act(deps, async (ctx, o) => {
          if (!o.query && !o.owned) throw usageError("Give --query <text> or --owned");
          if (o.query && o.query.length < 3) throw usageError("--query needs at least 3 characters");
          const r = await ctx.client.request({
            method: "GET",
            path: "/search/apps",
            query: { query: o.query, returnOwnedApps: o.owned ? true : undefined, storeFronts: o.storefront, limit: o.limit, offset: o.offset },
          });
          const rows = r.json?.result ?? [];
          const tc = r.json?.pagination?.totalCount;
          const truncated = typeof tc === "number" ? o.offset + rows.length < tc : rows.length >= o.limit;
          ctx.out.emit({ result: rows, pagination: { offset: o.offset, returned: rows.length, ...(typeof tc === "number" ? { totalCount: tc } : {}), truncated, ...(truncated ? { nextOffset: o.offset + rows.length } : {}) } }, [
            { header: "adamId", path: "adamId" },
            { header: "appName", path: "appName" },
            { header: "developerName", path: "developerName" },
          ]);
        }),
      ),
    { endpoint: "GET /v1/search/apps", examples: ["apple-ads-cli apps search --owned", "apple-ads-cli apps search --query 'example app' --storefront US"] },
  );

  doc(
    apps
      .command("get")
      .description("App details by adamId")
      .argument("<adamId>", "App Store app ID", idArg("adamId"))
      .action(act(deps, async (ctx, _o, [id]) => ctx.out.emit({ result: (await ctx.client.request({ method: "GET", path: `/apps/${id}` })).json?.result ?? null }))),
    { endpoint: "GET /v1/apps/{adamId}", examples: ["apple-ads-cli apps get 1234567890"] },
  );

  const elig = addListFlags(apps.command("eligibility").description("Where the app can run ads (country x placement x device)").argument("<adamId>", "App Store app ID", idArg("adamId")), "report")
    .option("--country <code>", "only this country or region")
    .option("--placement <placement>", "only this supply placement")
    .option("--state <state>", "ELIGIBLE or INELIGIBLE")
    .action(
      act(deps, async (ctx, o, [id]) => {
        // This endpoint wants a scalar number here; an array returns 404 "Data not found".
        const f: Filter[] = [{ field: "adamId", operator: "EQUALS", value: Number(id) }];
        if (o.country) f.push(filter("countryOrRegion", "EQUALS", o.country.toUpperCase()));
        if (o.placement) f.push(filter("supplyPlacement", "EQUALS", o.placement.toUpperCase()));
        if (o.state) f.push(filter("state", "EQUALS", o.state.toUpperCase()));
        f.push(...extraFilters(o));
        const body = buildQuery({ filters: f, sorting: (o.sort ?? []).map(parseSort) }) as Record<string, unknown>;
        const page = await paginate(ctx.client, { path: "/eligibilities/apps/query", body, pageMax: PAGE_MAX_ENTITY, ...listOpts(o, "report") });
        ctx.out.emit({ result: page.rows, pagination: page.pagination }, [
          { header: "country", path: "countryOrRegion" },
          { header: "placement", path: "supplyPlacement" },
          { header: "device", path: "deviceClass" },
          { header: "state", path: "state" },
        ]);
        truncationNote(ctx, page.pagination);
      }),
    );
  doc(elig, { endpoint: "POST /v1/eligibilities/apps/query", schema: "EligibilityQueryRequest", examples: ["apple-ads-cli apps eligibility 1234567890 --country US"] });

  doc(
    apps
      .command("locales")
      .description("Default product page text per locale")
      .argument("<adamId>", "App Store app ID", idArg("adamId"))
      .option("--language-code <code>", "only this locale, e.g. en-US")
      .action(
        act(deps, async (ctx, o, [id]) => {
          const body: Record<string, unknown> = {};
          if (o.languageCode) body.filters = [filter("languageCode", "EQUALS", o.languageCode)];
          const r = await ctx.client.request({ method: "POST", path: `/apps/${id}/locale-details/query`, body });
          ctx.out.emit({ result: r.json?.result ?? [] });
        }),
      ),
    { endpoint: "POST /v1/apps/{adamId}/locale-details/query", examples: ["apple-ads-cli apps locales 1234567890"] },
  );

  const pp = program.command("product-pages").description("Product pages (default, custom and optimisation pages)");
  const ppList = addListFlags(pp.command("list").description("List an app's product pages"), "entity", { deleted: false })
    .requiredOption("--adam-id <id>", "App Store app ID", idArg("--adam-id"))
    .option("--state <state>", "VISIBLE or HIDDEN")
    .action(
      act(deps, async (ctx, o) => {
        const f: Filter[] = [filter("adamId", "EQUALS", o.adamId)];
        if (o.state) f.push(filter("state", "EQUALS", o.state.toUpperCase()));
        f.push(...extraFilters(o));
        const body = buildQuery({ filters: f, sorting: (o.sort ?? []).map(parseSort), fields: parseFields(o.fields) }) as Record<string, unknown>;
        const page = await paginate(ctx.client, { path: "/product-pages/query", body, pageMax: PAGE_MAX_ENTITY, ...listOpts(o, "entity") });
        ctx.out.emit({ result: page.rows, pagination: page.pagination }, [
          { header: "id", path: "id" },
          { header: "name", path: "name" },
          { header: "state", path: "state" },
        ]);
        truncationNote(ctx, page.pagination);
      }),
    );
  doc(ppList, { endpoint: "POST /v1/product-pages/query", examples: ["apple-ads-cli product-pages list --adam-id 1234567890 --state VISIBLE"] });
  doc(
    pp
      .command("get")
      .description("Get a product page by ID")
      .argument("<productPageId>", "product page UUID")
      .action(act(deps, async (ctx, _o, [id]) => ctx.out.emit({ result: (await ctx.client.request({ method: "GET", path: `/product-pages/${encodeURIComponent(id!)}` })).json?.result ?? null }))),
    { endpoint: "GET /v1/product-pages/{productPageId}", examples: ["apple-ads-cli product-pages get 00000000-0000-0000-0000-000000000000"] },
  );

  const geo = program.command("geo").description("Geo lookup for targeting");
  doc(
    geo
      .command("search")
      .description("Search countries, regions, cities and postal codes")
      .requiredOption("--query <text>", "2+ characters, or * for all")
      .option("--entity <type>", "Country, AdminArea, Locality or PostalCode")
      .option("--country-code <code>", "limit to a country (lowercase is sent)")
      .option("--limit <n>", "maximum results", (v) => Number(v), 50)
      .option("--offset <n>", "start at this row", (v) => Number(v), 0)
      .action(
        act(deps, async (ctx, o) => {
          const r = await ctx.client.request({
            method: "GET",
            path: "/search/geo",
            query: { supplySource: "APPSTORE", query: o.query, entity: o.entity, countrycode: o.countryCode?.toLowerCase(), pageSize: o.limit, offset: o.offset },
          });
          const rows = r.json?.result ?? [];
          const tc = r.json?.pagination?.totalCount;
          const truncated = typeof tc === "number" ? o.offset + rows.length < tc : false;
          ctx.out.emit({ result: rows, pagination: { offset: o.offset, returned: rows.length, ...(typeof tc === "number" ? { totalCount: tc } : {}), truncated, ...(truncated ? { nextOffset: o.offset + rows.length } : {}) } }, [
            { header: "id", path: "id" },
            { header: "entity", path: "entity" },
            { header: "displayName", path: "displayName" },
            { header: "countryOrRegion", path: "countryOrRegion" },
          ]);
        }),
      ),
    { endpoint: "GET /v1/search/geo?supplySource=APPSTORE", examples: ["apple-ads-cli geo search --query 'united' --entity Country"] },
  );
}
