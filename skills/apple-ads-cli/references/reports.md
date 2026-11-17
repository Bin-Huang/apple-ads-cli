# Reports

Read this before answering any report question that is not a simple total.

## Kinds and required filters

| Command | Endpoint | Filter | groupBy options |
|---|---|---|---|
| `reports campaigns` | `/reports/apps/campaigns/query` | optional `--campaign-id ID…` (sent as `id IN`) | deviceClass, ageRange, gender, countryCode, adminArea, locality, countryOrRegion |
| `reports ad-groups` | `/reports/apps/adgroups/query` | `--campaign-id` required, `--ad-group-id` optional | same as campaigns |
| `reports keywords` | `/reports/apps/keywords/query` | `--campaign-id` required | deviceClass, countryOrRegion |
| `reports search-terms` | `/reports/apps/searchterms/query` | `--campaign-id` required | deviceClass, countryOrRegion |
| `reports ads` | `/reports/apps/ads/query` | `--campaign-id` required | countryOrRegion |

## Time range

- `--last Nd` covers the N full days before today in the ad account's time zone; today is excluded. The default is `7d`.
- `--start` and `--end` take `YYYY-MM-DD`, `today` or `yesterday`, and both days are included.
- `--time-zone ORTZ` (the account time zone) is the default. `UTC` is allowed except for search terms.
- `cli.provisionalFrom` marks where data may still change. Treat the last 1-2 days as provisional: installs can arrive late.

## Granularity

Leave `--granularity` out to get totals only. That is the right choice for "how much" questions.

| Granularity | Span |
|---|---|
| HOURLY | 7 days or less, starting within the last 365 days. Not for ads or search terms. |
| DAILY | 90 days or less |
| WEEKLY | 14 days or more |
| MONTHLY | 90 days or more |

With a granularity set, each row has `granularMetrics[]`, one entry per period.

## Metrics

Each row has `metadata` (the entity, plus any groupBy values) and `totalMetrics`.

- Volume and cost: `impressions`, `taps`, `ttr` (taps ÷ impressions, a fraction), `localSpend`, `cpt` (cost per tap), `cpm`.
- Installs: `tapInstalls` (installs within 30 days of a tap), `viewInstalls` (within 1 day of a view), `totalInstalls`, `tapNewDownloads`, `tapRedownloads`, `totalNewDownloads`, `totalRedownloads`.
- Rates and cost per install: `tapInstallRate` (tapInstalls ÷ taps), `tapInstallCPI` (spend ÷ tapInstalls), `totalAvgCPI`, `totalInstallRate`.
- Money is `{"amount":"12.40","currency":"USD"}`. Rates are fractions: 0.042 means 4.2%.
- `--metrics a,b` limits the fields returned. Missing count metrics are filled with 0 only for the metrics you asked for (all count metrics when `--metrics` is not given).
- Sorting defaults to `localSpend:DESC`; `--sort taps:DESC` changes it.

CPA (cost per install) is `tapInstallCPI` (tap-through) or `totalAvgCPI` (tap and view). If you divide spend by installs yourself, for example over summed rows, say so.

## What the CLI normalises

- No data: `result.rows` is `[]`. That means no activity in the range, not an error.
- Missing counts are filled in as 0. Apple leaves zero counts out.
- `result.grandTotal` holds the total across rows (skip it with `--no-grand-total`).
- Ad reports: Apple's placeholder "Default Ad" rows (`id: -1`) are dropped. `--include-default-ads` keeps them, marked with `cli.defaultAd`.
- Search terms: a row with no `searchTermText` is marked `cli.lowVolume: true`. Apple hides terms with fewer than 10 impressions a day. Low Volume is not zero.
- `--include-empty` adds entities with no activity. It cannot be combined with `--group-by` or used with search terms.
- Times in report `metadata` are in the account time zone. For schedules, read the entity (`campaigns get`), whose times are UTC.

## Privacy thresholds

- Search terms need at least 10 impressions a day to appear.
- Age, gender and location breakdowns need at least 100 impressions a day.
- Users who opted out of personalised ads appear as "User Withheld".

## Reading results safely

- Before saying "no data", check `pagination.totalCount`, the date range in `cli.timeRange` and the campaign ID. A campaign whose start date is in the future has no rows.
- If `pagination.truncated` is true, re-run with `--all`.
- Compare equal windows, for example the last 7 days against the 7 days before them (`--start` and `--end`).
- Base decisions on at least 10 taps for a keyword or term. Use 28-day totals for low-volume apps.
