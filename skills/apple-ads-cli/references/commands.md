# apple-ads-cli command reference

Every command prints one JSON document on stdout. Add `--output table` for a table. Every leaf command's `--help` names its endpoint; `apple-ads-cli schema commands` prints the whole tree as JSON. IDs below are placeholders.

## Contents

- Global, list and write flags
- Setup and account
- Apps, product pages, geo
- Campaigns
- Ad groups
- Keywords
- Negative keywords
- Creatives and ads
- Budget orders
- Reports, insights, history
- Schema and raw API

## Global, list and write flags

| Flag | Meaning |
|---|---|
| `--profile NAME` | Config profile (env `APPLE_ADS_PROFILE`) |
| `--ad-account-id ID` | Ad account (env `APPLE_ADS_AD_ACCOUNT_ID`) |
| `--output json\|table` | Output format (default json) |
| `--pretty` | Indented JSON |
| `--debug` | Requests and responses on stderr, secrets redacted |
| `--timeout S` | Request timeout in seconds (default 60) |

List flags, on every `list`, report and insight: `--limit N` (default 1000; 5000 for reports), `--all`, `--max-items N`, `--offset N`, `--sort field[:ASC|DESC]` (repeatable), `--filter field:OPERATOR[:v1,v2]` (repeatable; `IS_NULL` takes no value), and on entity lists `--fields a,b` and `--deleted`. `product-pages list` has no `--deleted`; `history list` has no `--fields` or `--deleted`; `insights keyword-suggestions` has no `--sort`, `--fields` or `--deleted` (Apple sorts nothing there).

Write flags:

- `--dry-run` and `--confirm` on every write; `--force-delete` as well on deletes.
- `--data JSON` / `--file PATH` (a body overlay merged under the flags; flags win) on campaigns, ad groups, creatives and ads create/update. On `keywords add`, `negatives add` and `keywords update`, `--file` is the keyword or update list, and there is no `--data`.
- `--allow-large` on campaigns and ad groups create/update, `keywords add`/`update` and `api`: needed to send a bid above `maxBid` (default 10.00) or a daily budget above `maxDailyBudget` (default 1000.00), in the account currency. Without it the write exits 6 `ABOVE_CEILING`. Set `maxBid`/`maxDailyBudget` in the profile (or `APPLE_ADS_MAX_BID`/`APPLE_ADS_MAX_DAILY_BUDGET`) for currencies with larger units.

## Setup and account

```bash
apple-ads-cli auth setup --client-id SEARCHADS.… --team-id SEARCHADS.… --key-id … --private-key PATH [--name PROFILE] [--protect CAMPAIGN_ID] [--no-verify]
apple-ads-cli auth status
apple-ads-cli auth doctor
apple-ads-cli auth logout [--all]
apple-ads-cli me
apple-ads-cli access
apple-ads-cli accounts get [AD_ACCOUNT_ID]
apple-ads-cli orgs get ORG_ID
```

`auth status` is offline. `auth doctor` runs 10 read-only checks and exits 3 if one fails. `accounts get` shows the currency and time zone that reports and budgets use.

## Apps, product pages, geo

```bash
apple-ads-cli apps search --owned
apple-ads-cli apps search --query "example app" [--storefront US] [--limit 20]
apple-ads-cli apps get APP_ID
apple-ads-cli apps eligibility APP_ID [--country US] [--placement APPSTORE_SEARCH_RESULTS] [--state ELIGIBLE]
apple-ads-cli apps locales APP_ID [--language-code en-US]
apple-ads-cli product-pages list --adam-id APP_ID [--state VISIBLE] [--sort name:ASC] [--fields name,state]
apple-ads-cli product-pages get PRODUCT_PAGE_ID
apple-ads-cli geo search --query "united" [--entity Country|AdminArea|Locality|PostalCode] [--country-code us]
```

## Campaigns

```bash
apple-ads-cli campaigns list [--status ENABLED|PAUSED] [--name TEXT]
apple-ads-cli campaigns get CAMPAIGN_ID [CAMPAIGN_ID…]
apple-ads-cli campaigns create --name NAME --adam-id APP_ID --daily-budget 5.00 --countries US[,GB] \
  [--placement APPSTORE_SEARCH_RESULTS] [--start YYYY-MM-DD] [--end YYYY-MM-DD] \
  [--bid-strategy manual-cpt|max-conversions] [--status PAUSED|ENABLED] [--allow-duplicate] --dry-run
apple-ads-cli campaigns update CAMPAIGN_ID [--name] [--daily-budget] [--start] [--end DATE|none] [--countries US,GB] --dry-run
apple-ads-cli campaigns pause CAMPAIGN_ID --dry-run
apple-ads-cli campaigns resume CAMPAIGN_ID --dry-run
apple-ads-cli campaigns delete CAMPAIGN_ID --confirm --force-delete
```

- Each campaign row gains `cli.budget`: `daily`, `monthlyMax` (daily × 30.4), `scheduleMax` (days × daily when there is an end date) and `daysLeft`.
- `create` sends PAUSED unless `--status ENABLED`. Times are UTC. The currency comes from the ad account.
- `update --countries` replaces the whole list.
- `--name` on `list` is a substring match in any case (LIKE with `ignoreCase`).

## Ad groups

```bash
apple-ads-cli ad-groups list [--campaign-id CAMPAIGN_ID] [--status] [--name TEXT]
apple-ads-cli ad-groups get AD_GROUP_ID
apple-ads-cli ad-groups create --campaign-id CAMPAIGN_ID --name NAME --bid 0.60 [--search-match on|off] [--start] [--end] [--status] --dry-run
apple-ads-cli ad-groups update AD_GROUP_ID [--bid 0.70] [--name] [--search-match on|off] [--end DATE|none] --dry-run
apple-ads-cli ad-groups pause|resume AD_GROUP_ID --dry-run
apple-ads-cli ad-groups delete AD_GROUP_ID --confirm --force-delete
```

`create` is PAUSED by default, with Search Match off and `startTime` set to now when `--start` is not given.

## Keywords

```bash
apple-ads-cli keywords list --campaign-id CAMPAIGN_ID | --ad-group-id AD_GROUP_ID [--status]
apple-ads-cli keywords get KEYWORD_ID
apple-ads-cli keywords add --ad-group-id AD_GROUP_ID --text "term" [--text "term 2"] [--match-type EXACT|BROAD] [--bid 0.50] --dry-run
apple-ads-cli keywords add --ad-group-id AD_GROUP_ID --file keywords.csv --dry-run
apple-ads-cli keywords update KEYWORD_ID [KEYWORD_ID…] --bid 0.55 --dry-run
apple-ads-cli keywords update --file updates.json --dry-run
apple-ads-cli keywords pause|resume KEYWORD_ID --dry-run
apple-ads-cli keywords delete KEYWORD_ID --confirm --force-delete
```

- A keyword file is a JSON array of strings or `{text, matchType?, bid?}`, or CSV `text[,matchType[,bid]]`. Use `--file -` for stdin.
- An update file is `[{"id": KEYWORD_ID, "bid": "0.55", "status": "PAUSED"}]`.
- The match type defaults to EXACT. Text and match type cannot change; delete and add again.
- Bulk requests go in chunks of 100. Existing text and match type pairs are skipped.

## Negative keywords

```bash
apple-ads-cli negatives list --campaign-id CAMPAIGN_ID [--campaign-level]
apple-ads-cli negatives list --ad-group-id AD_GROUP_ID
apple-ads-cli negatives add --campaign-id CAMPAIGN_ID --text "term" [--match-type EXACT|BROAD] --dry-run
apple-ads-cli negatives add --ad-group-id AD_GROUP_ID --text "term" --dry-run
apple-ads-cli negatives pause|resume NEGATIVE_ID --dry-run
apple-ads-cli negatives delete NEGATIVE_ID --confirm --force-delete
```

- `--campaign-id` alone lists campaign-level negatives, then each ad group's. Each row has `cli.scope` set to `campaign` or `adGroup`.
- The match type defaults to EXACT (Apple's default is BROAD).
- Pausing or deleting a negative widens reach, so the spend effect is `increase`.

## Creatives and ads

```bash
apple-ads-cli creatives list [--type CUSTOM_PRODUCT_PAGE|DEFAULT_PRODUCT_PAGE] [--status VALID|INVALID|PENDING]
apple-ads-cli creatives get CREATIVE_ID
apple-ads-cli creatives create --name NAME --adam-id APP_ID [--product-page-id PRODUCT_PAGE_ID] --dry-run
apple-ads-cli creatives delete CREATIVE_ID --confirm --force-delete

apple-ads-cli ads list [--campaign-id CAMPAIGN_ID] [--ad-group-id AD_GROUP_ID] [--status]
apple-ads-cli ads get AD_ID
apple-ads-cli ads create --ad-group-id AD_GROUP_ID --creative-id CREATIVE_ID --name NAME [--status] --dry-run
apple-ads-cli ads update AD_ID --name NAME --dry-run
apple-ads-cli ads pause|resume AD_ID --dry-run
apple-ads-cli ads delete AD_ID --confirm --force-delete
```

- A creative points at a product page. With `--product-page-id` it is a custom product page (the page must be VISIBLE), and without it, the default page. Creatives cannot change after creation.
- An ad places a VALID creative in an ad group, PAUSED by default.

## Budget orders

```bash
apple-ads-cli budget-orders list [--status ACTIVE|INACTIVE]
apple-ads-cli budget-orders get BUDGET_ORDER_ID
```

Read-only.

## Reports, insights, history

See `reports.md` for the rules.

```bash
apple-ads-cli reports campaigns [--campaign-id ID…] [--last 7d | --start DATE --end DATE] [--granularity DAILY] [--group-by countryOrRegion]
apple-ads-cli reports ad-groups|keywords|search-terms|ads --campaign-id ID [--ad-group-id ID] [range flags]
apple-ads-cli insights impression-share --adam-id APP_ID [--country US] [--slots first|all] [--last 14d]
apple-ads-cli insights impression-share --adam-id APP_ID --granularity WEEKLY_SUN_SAT --start SUNDAY --end SATURDAY
apple-ads-cli insights keyword-suggestions --adam-id APP_ID [--term TEXT] [--country US]
apple-ads-cli history list [--since 7d | --start DATE --end DATE] [--campaign-id ID] [--ad-group-id ID] [--entity-type Keyword] [--event-type UPDATE]
apple-ads-cli history get DETAIL_ID
```

- `history list` rows carry `metas[].detailId` for `history get`. `--end` is inclusive (the CLI sends the next day, because Apple reads the end date as 00:00).
- With `--campaign-id` or `--ad-group-id` the CLI runs two queries, merges them newest first, then applies `--offset` and `--limit`.
- `impression-share` with WEEKLY_SUN_SAT needs `--start` on a Sunday; `--last` rarely lands on one.

## Schema and raw API

```bash
apple-ads-cli schema [commands | filters RESOURCE | reports | enums [NAME] | exit-codes]
apple-ads-cli api GET /path [--query k=v]
apple-ads-cli api POST /resource/query --data '{"filters":[…],"pagination":{"offset":0,"pageSize":100}}'
apple-ads-cli api PUT|POST|DELETE /path --data '{…}' --dry-run
```

Raw writes need `--confirm` and pass the protected-campaign guard (including `/creatives/{id}`, through the ads that use the creative). Their spend effect is `unknown` unless a bid or budget is above the ceiling. Paths may contain only letters, digits and `- . _ ~ /`: `#`, `%`, `\` and `.`/`..` segments are refused (exit 2); pass parameters with `--query`. `GET` takes no body.
