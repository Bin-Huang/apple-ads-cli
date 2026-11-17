# Changelog

## 2.0.0

A ground-up rewrite on the Apple Ads Platform API v1. Apple sunsets the Campaign Management API v5, which 1.x used, on 26 January 2027.

### Breaking changes

- Most command names and flags changed. Most commands are now `<noun> <verb>`, for example `campaigns list` and `reports keywords`.
- Output is `{"result": …, "pagination": …}`. 1.x printed Apple's `data` value. Report rows are in `result.rows`.
- Errors are `{"error": {"code", "message", "hint", …}}` with exit codes 1 to 6. 1.x printed `{"error": "message"}` and exited 1.
- Output is compact when piped and indented in a terminal. `--pretty` indents.
- Reports default to totals for the last 7 days in the ad account's time zone. 1.x defaulted to DAILY rows in UTC and required both dates. `--start-date` and `--end-date` are now `--start` and `--end`.
- `--limit` defaults to 1000 (5000 on reports) instead of 20.
- The 1.x `credentials.json` is not read. `APPLE_ADS_ACCESS_TOKEN` still works. Run `auth setup` with the API key's client ID, team ID, key ID and private key path. The CLI now signs its own client secret and refreshes the access token.
- The ad account ID replaces the org ID in the request context.
- Node.js 22 or later is required.
- Removed: `--format` and `--credentials` (use `--config` or `--profile`).

### Added

- Writes: create, update, pause, resume and delete for campaigns, ad groups and ads; create and delete for creatives; bulk add, update, pause, resume and delete for keywords; bulk add, pause, resume and delete for negative keywords. Every write supports `--dry-run`, needs `--confirm`, reports its spend effect and re-reads the result.
- Protected campaigns per profile (`protectedCampaignIds`): writes to them, or anything under them, are refused with exit 6.
- Reports for campaigns, ad groups, keywords, search terms and ads, with local checks for spans, granularity and time zone. Reports always send a sort order (in testing, the 1.x report requests returned 400 without one).
- `apps`, `product-pages`, `geo`, `insights`, `history`, `schema` and a raw `api` command.
- `--all` and `--max-items` on lists and reports, and a `truncated` flag in every result.
- Documented exit codes (0-6), JSON errors with hints, retries with backoff, and rate-limit pacing.
- `--output table`.
- A rewritten agent skill with reference files.
- Tests (`node:test`, no network).

### Safety hardening (before release)

- Raw `api`: reads are classified by the URL that is actually sent; paths with `#`, `%`, `\` or dot segments are refused (exit 2); GET with a body is a usage error; protected IDs match with leading zeros; `/creatives/{id}` writes resolve the campaigns of the ads that use the creative.
- A private key path setting that holds the key itself is refused without echoing it (exit 3 `KEY_IS_CONTENT`).
- Bulk writes that Apple does not confirm item by item exit 1 `BULK_UNCONFIRMED` instead of reporting success.
- `after` keeps the bid (keywords, ad groups) so a change can be checked.
- Bids above `maxBid` and daily budgets above `maxDailyBudget` (defaults 10.00 and 1000.00) need `--allow-large` (exit 6 `ABOVE_CEILING`).
- `campaigns update`/`ad-groups update` assess `--data` keys (status, Search Match, budget, bid, end date, countries) like their flags; `keywords add` assesses per-item status.
- `history list --end` is inclusive; with `--campaign-id`/`--ad-group-id`, `--offset` and `--limit` apply to the merged list.
- `--name` on `campaigns list` and `ad-groups list` ignores case.
- Reports zero-fill only the requested metrics; `pagination.returned` matches the rows after Default Ad rows are dropped.
- `product-pages list` and `apps eligibility` send `--sort` (and `--fields` on product pages). Flags an endpoint cannot use are no longer accepted: `--deleted` on `product-pages list`, and `--sort`, `--fields` and `--deleted` on `insights keyword-suggestions`.
- Paging follows server-capped pages to `totalCount`.
- `auth setup` leaves the mode of a user-chosen config directory alone.
- The npm package never includes `skills/*/references/local.md`.

### Migrating from 1.x

| 1.x | 2.0 |
|---|---|
| API v5, `https://api.searchads.apple.com/api/v5` | Platform API v1, `https://api.ads.apple.com/v1` |
| pre-made access token in `credentials.json` | `auth setup` with the key path; tokens refresh automatically |
| org ID | ad account ID |
| `acl` | `access` |
| `me` | `me` (unchanged) |
| `campaigns` | `campaigns list` |
| `campaign <id>` | `campaigns get <id>` |
| `adgroups <campaignId>` | `ad-groups list --campaign-id <id>` |
| `ads <campaignId> <adGroupId>` | `ads list --ad-group-id <id>` |
| `keywords <campaignId> <adGroupId>` | `keywords list --ad-group-id <id>` |
| `campaign-negative-keywords <campaignId>` | `negatives list --campaign-id <id> --campaign-level` |
| `negative-keywords <campaignId> <adGroupId>` | `negatives list --ad-group-id <id>` |
| `search-apps <query>` | `apps search --query <query>` |
| `search-apps --return-own-apps` | `apps search --owned` |
| `app-eligibility <adamId>` | `apps eligibility <adamId>` |
| `app <adamId>` | `apps get <adamId>` |
| `budget-orders` / `budget-order <id>` | `budget-orders list` / `budget-orders get <id>` |
| `report <campaignId>` | `reports campaigns --campaign-id <id>` |
| `report-adgroups <campaignId>` | `reports ad-groups --campaign-id <id>` |
| `report-keywords <campaignId>` | `reports keywords --campaign-id <id>` |
| `--start-date` / `--end-date` | `--start` / `--end`, or `--last Nd` |
| `--return-records-with-no-metrics` | `--include-empty` |
| `--format json` / `--format compact` | removed; `--pretty` indents |
| `--credentials <file>` | `--config <file>` / `--profile <name>` (a new file format) |
| `APPLE_ADS_ORG_ID` | `APPLE_ADS_AD_ACCOUNT_ID` |

The old `~/.config/apple-ads-cli/credentials.json` is not read. `auth status` and `auth doctor` warn when it exists; you can delete it after running `auth setup`. The same API key works for both APIs, and campaign IDs are unchanged.

## 1.0.4 and earlier

Read-only CLI on the Campaign Management API v5, by Benn Huang.
