# apple-ads-cli

Apple Ads CLI & Skills for AI agents (and humans). Manage App Store search ad campaigns, keywords and negative keywords, check app eligibility, and pull reports by device, country and demographics. Built on the [Apple Ads Platform API v1](https://developer.apple.com/documentation/apple-ads-platform-api).

It reads accounts, campaigns, ad groups, keywords, negative keywords, creatives, ads, product pages and reports, and it changes them through a dry-run and confirm protocol. Output is JSON on stdout, so scripts and AI agents can parse it directly.

**Works with:** OpenClaw, Claude Code, Cursor, Codex, and any agent that can run shell commands.

> **Version 2.0 is a rewrite.** Version 1.x used Apple's Campaign Management API v5, which Apple shuts down on **26 January 2027**. Most command names and flags changed, and so did the shape of the JSON output. See [Migrating from 1.x](#migrating-from-1x).

## Install

Requires Node.js 22 or later.

Tell your AI agent (e.g. OpenClaw):

> Install this CLI and skills from https://github.com/Bin-Huang/apple-ads-cli

Or install manually:

```bash
npm install -g apple-ads-cli        # or: pnpm add -g apple-ads-cli

# Add the skill for AI agents (Claude Code, Cursor, Codex, etc.)
npx skills add Bin-Huang/apple-ads-cli
```

Or run directly: `npx apple-ads-cli --help`

From source:

```bash
git clone https://github.com/Bin-Huang/apple-ads-cli.git
cd apple-ads-cli
pnpm install        # or: npm install
pnpm build          # or: npm run build
pnpm test           # or: npm test (no network)
node dist/index.js --version
```

From a clone, add the agent skill by copying `skills/apple-ads-cli/` into your agent's skills folder (for Claude Code, `~/.claude/skills/`).

## Set up

1. Create a key pair:

   ```bash
   mkdir -p ~/.config/apple-ads-cli && cd ~/.config/apple-ads-cli
   openssl ecparam -genkey -name prime256v1 -noout -out private-key.pem
   openssl ec -in private-key.pem -pubout -out public-key.pem
   chmod 600 private-key.pem
   ```

2. In [Apple Ads](https://ads.apple.com/app-store/), open **Account Settings > API**, upload `public-key.pem`, and copy the client ID, team ID and key ID. The API user needs a role such as API Campaign Manager (to change campaigns) or API Read Only.

3. Save a profile. The CLI stores the key's **path**, never its contents:

   ```bash
   apple-ads-cli auth setup \
     --client-id SEARCHADS.00000000-0000-0000-0000-000000000000 \
     --team-id SEARCHADS.00000000-0000-0000-0000-000000000000 \
     --key-id 00000000-0000-0000-0000-000000000000 \
     --private-key ~/.config/apple-ads-cli/private-key.pem
   ```

   `auth setup` gets a token, lists the ad accounts the key can use, and saves the ad account when there is only one. With several, add `--ad-account-id 123456789`.

4. Check the setup:

   ```bash
   apple-ads-cli auth doctor
   ```

### How credentials work

- The CLI signs a short-lived ES256 client secret with `node:crypto` and exchanges it at `https://appleid.apple.com/auth/oauth2/token` for a one-hour access token.
- The token is cached in `~/.cache/apple-ads-cli/tokens/` (mode 600) and refreshed 60 seconds before it expires, or after a 401.
- The config is `~/.config/apple-ads-cli/config.json` (mode 600). The CLI refuses a config that group or others can read.
- Each setting resolves in this order: flag, then environment variable, then the config profile. `auth status` shows where each value came from.

| Environment variable | Setting |
|---|---|
| `APPLE_ADS_PROFILE` | Profile name |
| `APPLE_ADS_CONFIG` | Config file path |
| `APPLE_ADS_CLIENT_ID`, `APPLE_ADS_TEAM_ID`, `APPLE_ADS_KEY_ID` | Credentials |
| `APPLE_ADS_PRIVATE_KEY_PATH` | Path to the private key (a path only: key contents are refused, exit 3 `KEY_IS_CONTENT`) |
| `APPLE_ADS_AD_ACCOUNT_ID` | Ad account (sent as `X-AP-Context: adAccountId=…`) |
| `APPLE_ADS_PROTECTED_CAMPAIGN_IDS` | Extra protected campaigns, comma-separated (added to the config list) |
| `APPLE_ADS_MAX_BID`, `APPLE_ADS_MAX_DAILY_BUDGET` | Sanity ceilings (profile keys `maxBid`, `maxDailyBudget`; defaults 10.00 and 1000.00) |
| `APPLE_ADS_ACCESS_TOKEN` | A ready-made token, used as given with no refresh |

## Commands

Commands follow `apple-ads-cli <noun> <verb>`. Every command's `--help` shows its endpoint, examples and exit codes, and `apple-ads-cli schema commands` prints the whole tree as JSON.

**Global flags:** `--profile`, `--ad-account-id`, `--output json|table`, `--pretty`, `--debug` (requests on stderr, secrets redacted), `--config`, `--timeout <seconds>`.

**List flags:** `--limit`, `--all`, `--max-items`, `--offset`, `--sort field[:ASC|DESC]`, `--filter field:OPERATOR[:v1,v2]`, and on entity lists `--fields a,b` and `--deleted`. Every list reports `pagination.truncated`, so results are never cut off silently.

**Write flags:** `--dry-run`, `--confirm`, `--data <json>` or `--file <path>` (merged under the flags), and `--force-delete` for deletes.

### Account and setup

```bash
apple-ads-cli auth setup --client-id … --team-id … --key-id … --private-key <path>
apple-ads-cli auth status            # offline: profile, sources, key and token cache state
apple-ads-cli auth doctor            # 10 read-only checks; exit 3 if one fails
apple-ads-cli auth logout [--all]    # delete cached tokens
apple-ads-cli me
apple-ads-cli access                 # ad accounts and roles
apple-ads-cli accounts get [123456789]
apple-ads-cli orgs get 987654321
```

### Apps, product pages and geo

```bash
apple-ads-cli apps search --owned
apple-ads-cli apps search --query "example app" --storefront US
apple-ads-cli apps get 1234567890
apple-ads-cli apps eligibility 1234567890 --country US
apple-ads-cli apps locales 1234567890
apple-ads-cli product-pages list --adam-id 1234567890 --state VISIBLE
apple-ads-cli product-pages get 00000000-0000-0000-0000-000000000000
apple-ads-cli geo search --query "united" --entity Country
```

### Campaigns, ad groups and ads

```bash
apple-ads-cli campaigns list [--status ENABLED] [--name text]   # --name: substring, any case
apple-ads-cli campaigns get 111111111
apple-ads-cli campaigns create --name "Example US Search" --adam-id 1234567890 \
  --daily-budget 5.00 --countries US --end 2027-01-31 --dry-run
apple-ads-cli campaigns update 111111111 --daily-budget 6.00 --dry-run
apple-ads-cli campaigns pause 111111111 --confirm
apple-ads-cli campaigns resume 111111111 --confirm
apple-ads-cli campaigns delete 111111111 --confirm --force-delete

apple-ads-cli ad-groups list --campaign-id 111111111
apple-ads-cli ad-groups get 222222222
apple-ads-cli ad-groups create --campaign-id 111111111 --name "Example Group" --bid 0.60 --dry-run
apple-ads-cli ad-groups update 222222222 --bid 0.70 --search-match off --dry-run
apple-ads-cli ad-groups pause|resume 222222222 --confirm
apple-ads-cli ad-groups delete 222222222 --confirm --force-delete

apple-ads-cli creatives list [--status VALID]
apple-ads-cli creatives get 666666
apple-ads-cli creatives create --name "Example CPP" --adam-id 1234567890 \
  --product-page-id 00000000-0000-0000-0000-000000000000 --dry-run
apple-ads-cli creatives delete 666666 --confirm --force-delete

apple-ads-cli ads list --campaign-id 111111111
apple-ads-cli ads get 555555555
apple-ads-cli ads create --ad-group-id 222222222 --creative-id 666666 --name "Example Ad" --dry-run
apple-ads-cli ads update 555555555 --name "Example Ad 2" --dry-run
apple-ads-cli ads pause|resume 555555555 --confirm
apple-ads-cli ads delete 555555555 --confirm --force-delete

apple-ads-cli budget-orders list
apple-ads-cli budget-orders get 777777777
```

### Keywords and negative keywords

```bash
apple-ads-cli keywords list --campaign-id 111111111      # or --ad-group-id
apple-ads-cli keywords get 333333333
apple-ads-cli keywords add --ad-group-id 222222222 --text "example term" --text "other term" --dry-run
apple-ads-cli keywords add --ad-group-id 222222222 --file keywords.csv --bid 0.50 --confirm
apple-ads-cli keywords update 333333333 --bid 0.55 --dry-run
apple-ads-cli keywords update --file updates.json --confirm      # [{"id":…, "bid":"0.55"}]
apple-ads-cli keywords pause|resume 333333333 --confirm
apple-ads-cli keywords delete 333333333 --confirm --force-delete

apple-ads-cli negatives list --campaign-id 111111111 [--campaign-level]
apple-ads-cli negatives list --ad-group-id 222222222
apple-ads-cli negatives add --campaign-id 111111111 --text "free example" --dry-run
apple-ads-cli negatives pause|resume 444444444 --confirm
apple-ads-cli negatives delete 444444444 --confirm --force-delete
```

Keyword files are a JSON array (strings or `{text, matchType?, bid?}`) or CSV (`text[,matchType[,bid]]`). Bulk requests go in chunks of 100 with partial success allowed. Keywords and negatives that already exist are skipped and listed under `existing`.

### Reports, insights and history

```bash
apple-ads-cli reports campaigns --last 7d
apple-ads-cli reports campaigns --campaign-id 111111111 --start 2026-11-01 --end 2026-11-14 --granularity DAILY
apple-ads-cli reports ad-groups --campaign-id 111111111 --last 28d --group-by countryOrRegion
apple-ads-cli reports keywords --campaign-id 111111111 --last 28d --output table
apple-ads-cli reports search-terms --campaign-id 111111111 --last 28d
apple-ads-cli reports ads --campaign-id 111111111 --start yesterday --end yesterday

apple-ads-cli insights impression-share --adam-id 1234567890 --country US --last 14d
apple-ads-cli insights keyword-suggestions --adam-id 1234567890 --country US

apple-ads-cli history list --since 7d --campaign-id 111111111
apple-ads-cli history get Campaign.111111111.TXN_ID
```

Report rules the CLI checks before sending:

- `--last Nd` is the N full days before today in the ad account's time zone. Today is excluded. The default is `--last 7d`.
- Without `--granularity`, a report returns totals for the range.
- Dates are in the ad account's time zone (`ORTZ`). Pass `--time-zone UTC` for UTC.
- `--group-by` takes `deviceClass`, `ageRange`, `gender`, `countryCode`, `adminArea`, `locality` or `countryOrRegion` on campaign and ad group reports, `deviceClass` or `countryOrRegion` on keyword and search term reports, and `countryOrRegion` on ad reports.
- Campaign reports filter on campaign `id`. The other reports need `--campaign-id`.
- Spans: HOURLY up to 7 days, DAILY up to 90, WEEKLY 14 or more, MONTHLY 90 or more. No HOURLY for ads or search terms, and search terms are ORTZ only.
- An empty result becomes `rows: []`, missing requested counts become 0, and Apple's placeholder "Default Ad" rows are dropped (counted in `pagination.droppedDefaultAds`) unless you pass `--include-default-ads`.
- `history list --end` is inclusive.

### Discovery and raw requests

```bash
apple-ads-cli schema                        # topics
apple-ads-cli schema filters keywords       # filterable fields and operators
apple-ads-cli schema reports                # metrics, groupBy, span rules
apple-ads-cli schema enums campaigndisplaystatus
apple-ads-cli schema exit-codes

apple-ads-cli api GET /campaigns/111111111
apple-ads-cli api POST /campaigns/query --data '{"pagination":{"offset":0,"pageSize":10}}'
apple-ads-cli api PUT /adgroups/222222222 --data '{"name":"Example"}' --dry-run
```

`api` runs GET and `…/query` requests directly, judged by the URL that is actually sent. Any other request is a write and follows the safety model below. Paths with `#`, `%`, `\` or `.`/`..` segments are refused, and GET takes no body.

## Safety model

- **Read-only by default.** Nothing changes without `--confirm`. Without it, the command prints the plan and exits 6.
- **`--dry-run`** prints the exact method, URL, `X-AP-Context` value and JSON body, then exits 0 without sending.
- **The plan shows the spend effect.** `spend.effect` is `increase`, `decrease`, `none` or `unknown`, with reasons. Bid changes over 15% and budget changes over 20% are flagged `largeStep`. Campaign plans include Apple's ceilings: monthly spend can reach the daily budget × 30.4, and a scheduled campaign can spend up to days × daily budget.
- **Sanity ceilings.** A bid above `maxBid` (default 10.00) or a daily budget above `maxDailyBudget` (default 1000.00), in the account currency, exits 6 `ABOVE_CEILING` unless you pass `--allow-large`. Set both in the profile for currencies with larger units, such as JPY.
- **Safe defaults.** New campaigns, ad groups and ads are created PAUSED. New negatives default to EXACT match. Deletes also need `--force-delete`.
- **Protected campaigns.** Add campaign IDs to `protectedCampaignIds` in a profile (or `auth setup --protect <id>`). Any write to such a campaign, or to anything under it (including a creative used by one of its ads), exits 6 before it is sent. Set `allowPauseProtected: true` to let pauses and new negatives through.
- **Verification.** After sending, the CLI reads the entities again and prints `after`, with `status`, `systemStatus`, `displayStatus` and the changed bid or budget. A bulk write that Apple does not confirm item by item exits 1 `BULK_UNCONFIRMED`.
- **Secrets.** Tokens, the client secret and the key never appear in output or `--debug` logs.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | OK, including `--dry-run` |
| 1 | API or runtime error, or a partial bulk failure |
| 2 | Usage error or local validation failure |
| 3 | Auth or config error |
| 4 | Not found |
| 5 | Rate limited or transient (retries ran out) |
| 6 | Refused for safety: `CONFIRM_REQUIRED`, `PROTECTED`, `FORCE_DELETE_REQUIRED` or `ABOVE_CEILING` |

Errors print to stderr as `{"error":{"code","message","hint","status","requestId","details"}}`.

Reads retry on 429 and 5xx with backoff up to 16 seconds and honour `Retry-After`. Writes retry only on 429, plus once after a token refresh on 401.

## Migrating from 1.x

Version 1.x used the Campaign Management API v5 with a pre-made access token and an org ID. Version 2.0 uses the Platform API v1, signs in with your key, and uses the ad account ID. The same API key works for both, and campaign IDs carry over.

| 1.x | 2.0 |
|---|---|
| `credentials.json` with an access token | `auth setup` with the key path |
| `--credentials <file>` | `--config <file>` or `--profile <name>`. The config file has a new format, written by `auth setup` |
| `APPLE_ADS_ACCESS_TOKEN` and `APPLE_ADS_ORG_ID` | `APPLE_ADS_ACCESS_TOKEN` still works, with `APPLE_ADS_AD_ACCOUNT_ID`. It is used before the key sign-in and is not refreshed, so unset it after `auth setup` |
| org ID | ad account ID (`--ad-account-id`). `access` lists both |
| `acl` | `access` |
| `me` | `me` (unchanged) |
| `campaigns` / `campaign <id>` | `campaigns list` / `campaigns get <id>` |
| `adgroups <campaignId>` | `ad-groups list --campaign-id <id>` |
| `ads <campaignId> <adGroupId>` | `ads list --ad-group-id <id>` |
| `keywords <campaignId> <adGroupId>` | `keywords list --ad-group-id <id>` |
| `campaign-negative-keywords <campaignId>` | `negatives list --campaign-id <id> --campaign-level` |
| `negative-keywords <campaignId> <adGroupId>` | `negatives list --ad-group-id <id>` |
| `search-apps <query>` / `app-eligibility <adamId>` / `app <adamId>` | `apps search --query <q>` / `apps eligibility <adamId>` / `apps get <adamId>` |
| `search-apps --return-own-apps` | `apps search --owned` |
| `budget-orders` / `budget-order <id>` | `budget-orders list` / `budget-orders get <id>` |
| `report <campaignId>` | `reports campaigns --campaign-id <id>` |
| `report-adgroups <campaignId>` | `reports ad-groups --campaign-id <id>` |
| `report-keywords <campaignId>` | `reports keywords --campaign-id <id>` |
| `--start-date` / `--end-date` (required) | `--start` / `--end`, or `--last Nd`. The default is the last 7 days |
| reports default to `--granularity DAILY` | totals unless you pass `--granularity` |
| report dates in UTC | the ad account's time zone. Pass `--time-zone UTC` for the 1.x behaviour |
| `--return-records-with-no-metrics` | `--include-empty` (not with `--group-by`) |
| `--limit` defaults to 20 | `--limit` defaults to 1000 (5000 on reports). `--all` follows every page |
| `--format json` / `--format compact` | removed. Output is compact when piped and indented in a terminal. `--pretty` indents |
| output is Apple's `data` value | `{"result": …, "pagination": …}`. Report rows are in `result.rows` |
| errors are `{"error": "message"}` with exit 1 | `{"error": {"code", "message", "hint", …}}` with [exit codes](#exit-codes) 1 to 6 |

See [CHANGELOG.md](CHANGELOG.md) for details.

## API version

- API: Apple Ads Platform API v1, `https://api.ads.apple.com/v1`.
- The Campaign Management API v5 that 1.x used is sunset on 26 January 2027.
- Apple docs: [Platform API](https://developer.apple.com/documentation/apple-ads-platform-api), [OAuth](https://developer.apple.com/documentation/apple-ads-platform-api/implementing-oauth-for-the-apple-ads-platform-api), [rate limits](https://developer.apple.com/documentation/apple-ads-platform-api/rate-limits).

## Related

- [google-ads-open-cli](https://github.com/Bin-Huang/google-ads-open-cli) -- Google Ads CLI & Skills for AI agents (and humans)
- [meta-ads-open-cli](https://github.com/Bin-Huang/meta-ads-open-cli) -- Meta Ads CLI & Skills for AI agents (and humans)
- [microsoft-ads-cli](https://github.com/Bin-Huang/microsoft-ads-cli) -- Microsoft Ads CLI & Skills for AI agents (and humans)
- [amazon-ads-open-cli](https://github.com/Bin-Huang/amazon-ads-open-cli) -- Amazon Ads CLI & Skills for AI agents (and humans)
- [tiktok-ads-cli](https://github.com/Bin-Huang/tiktok-ads-cli) -- TikTok Ads CLI & Skills for AI agents (and humans)
- [linkedin-ads-cli](https://github.com/Bin-Huang/linkedin-ads-cli) -- LinkedIn Ads CLI & Skills for AI agents (and humans)
- [x-ads-cli](https://github.com/Bin-Huang/x-ads-cli) -- X Ads CLI & Skills for AI agents (and humans)
- [snapchat-ads-cli](https://github.com/Bin-Huang/snapchat-ads-cli) -- Snapchat Ads CLI & Skills for AI agents (and humans)
- [pinterest-ads-cli](https://github.com/Bin-Huang/pinterest-ads-cli) -- Pinterest Ads CLI & Skills for AI agents (and humans)
- [reddit-ads-cli](https://github.com/Bin-Huang/reddit-ads-cli) -- Reddit Ads CLI & Skills for AI agents (and humans)
- [spotify-ads-cli](https://github.com/Bin-Huang/spotify-ads-cli) -- Spotify Ads CLI & Skills for AI agents (and humans)
- [google-analytics-cli](https://github.com/Bin-Huang/google-analytics-cli) -- Google Analytics CLI & Skills for AI agents (and humans)
- [google-search-console-cli](https://github.com/Bin-Huang/google-search-console-cli) -- Google Search Console CLI & Skills for AI agents (and humans)
- [youtube-analytics-cli](https://github.com/Bin-Huang/youtube-analytics-cli) -- YouTube Analytics CLI & Skills for AI agents (and humans)
- [x-analytics-cli](https://github.com/Bin-Huang/x-analytics-cli) -- X Analytics CLI & Skills for AI agents (and humans)
- [camoufox-cli](https://github.com/Bin-Huang/camoufox-cli) -- Anti-detect browser CLI & Skills for AI agents

## License

Apache-2.0. See [LICENSE](LICENSE).
