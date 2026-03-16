# apple-ads-cli

Give AI agents direct access to Apple Ads data. One command to query campaigns, keywords, creatives, and pull performance reports -- no SDK, no docs to read, no tokens wasted on boilerplate.

**Works with:** OpenClaw, Claude Code, Cursor, Codex, and any agent that can run shell commands.

## Installation

```bash
npm install -g apple-ads-cli
```

Or run directly with npx:

```bash
npx apple-ads-cli --help
```

## How it works

Built on the official [Apple Ads Campaign Management API v5](https://developer.apple.com/documentation/apple_ads). Handles JWT-based OAuth2 authentication and the `X-AP-Context` organization header. Every command outputs structured JSON to stdout, ready for agents to parse without extra processing.

Core endpoints covered:

- **[ACL / Me](https://developer.apple.com/documentation/apple_search_ads/calling_the_apple_search_ads_api)** -- user access control and identity
- **[Campaigns](https://developer.apple.com/documentation/apple_search_ads/campaigns)** -- list and inspect campaigns
- **[Ad Groups](https://developer.apple.com/documentation/apple_search_ads/campaigns)** -- list ad groups under a campaign
- **[Ads](https://developer.apple.com/documentation/apple_search_ads/campaigns)** -- list ads under an ad group
- **[Keywords](https://developer.apple.com/documentation/apple_search_ads/campaigns)** -- list targeting keywords and negative keywords
- **[Budget Orders](https://developer.apple.com/documentation/apple_search_ads/campaigns)** -- list and inspect budget orders
- **[Apps](https://developer.apple.com/documentation/apple_search_ads/campaigns)** -- search apps, check eligibility, get app details
- **[Reports](https://developer.apple.com/documentation/apple_search_ads/reports)** -- campaign, ad group, and keyword level reports

## Setup

### Step 1: Get API access

1. Sign in to [Apple Search Ads](https://searchads.apple.com/) with an account that has Admin or API permissions.
2. Go to **Account Settings > API** to manage your API credentials.

### Step 2: Generate a key pair and upload the public key

Generate an ECDSA key pair:

```bash
# Generate private key
openssl ecparam -genkey -name prime256v1 -noout -out private-key.pem

# Extract public key
openssl ec -in private-key.pem -pubout -out public-key.pem
```

Upload the contents of `public-key.pem` in **Account Settings > API**. After uploading, Apple provides your `clientId`, `teamId`, and `keyId`.

### Step 3: Create a client secret and get an access token

A client secret is a JWT signed with your private key. The JWT header and payload:

```json
// Header
{
  "alg": "ES256",
  "kid": "YOUR_KEY_ID"
}

// Payload
{
  "sub": "YOUR_CLIENT_ID",
  "aud": "https://appleid.apple.com",
  "iat": 1234567890,
  "exp": 1234654290,
  "iss": "YOUR_TEAM_ID"
}
```

Sign the JWT with your private key (ES256 algorithm), then exchange it for an access token:

```bash
curl -X POST https://appleid.apple.com/auth/oauth2/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=YOUR_CLIENT_ID&client_secret=YOUR_JWT&scope=searchadsorg"
```

The response contains an `access_token` (valid for 1 hour). For the full process including a Python example, see [Apple's OAuth guide](https://developer.apple.com/documentation/apple_search_ads/implementing_oauth_for_the_apple_search_ads_api).

### Step 4: Place the credentials file

Choose one of these options:

```bash
# Option A: Default path (recommended)
mkdir -p ~/.config/apple-ads-cli
cat > ~/.config/apple-ads-cli/credentials.json << EOF
{
  "access_token": "YOUR_ACCESS_TOKEN",
  "org_id": "YOUR_ORG_ID"
}
EOF

# Option B: Environment variables
export APPLE_ADS_ACCESS_TOKEN=your_access_token
export APPLE_ADS_ORG_ID=your_org_id

# Option C: Pass per command
apple-ads-cli --credentials /path/to/credentials.json campaigns
```

Your `org_id` is the organization identifier shown in the Apple Search Ads UI. You can also retrieve it using the `acl` command after authenticating.

Credentials are resolved in this order:
1. `--credentials <path>` flag
2. `APPLE_ADS_ACCESS_TOKEN` and `APPLE_ADS_ORG_ID` env vars
3. `~/.config/apple-ads-cli/credentials.json` (auto-detected)

## Usage

All commands output pretty-printed JSON by default. Use `--format compact` for compact single-line JSON.

### search-apps

Search for iOS apps to promote in a campaign.

```bash
apple-ads-cli search-apps "my app name"
apple-ads-cli search-apps "fitness" --return-own-apps --limit 10
```

Options:
- `--return-own-apps` -- only return apps owned by the organization
- `--limit <n>` -- number of results (default 20)
- `--offset <n>` -- pagination offset (default 0)

### app-eligibility

Check if an app is eligible to promote in a campaign.

```bash
apple-ads-cli app-eligibility 123456789
```

### app

Get app details by Adam ID.

```bash
apple-ads-cli app 123456789
```

### acl

Get the user access control list for all organizations. Useful for finding your `orgId`.

```bash
apple-ads-cli acl
```

### me

Get details of the authenticated API user (userId, parentOrgId).

```bash
apple-ads-cli me
```

### campaigns

List all campaigns in the organization.

```bash
apple-ads-cli campaigns
apple-ads-cli campaigns --limit 50 --offset 0
```

Options:
- `--limit <n>` -- number of results (default 20)
- `--offset <n>` -- pagination offset (default 0)

### campaign

Get a specific campaign by ID.

```bash
apple-ads-cli campaign 123456
```

### budget-orders

List all budget orders for the organization.

```bash
apple-ads-cli budget-orders
apple-ads-cli budget-orders --limit 50
```

Options:
- `--limit <n>` -- number of results (default 20)
- `--offset <n>` -- pagination offset (default 0)

### budget-order

Get a specific budget order by ID.

```bash
apple-ads-cli budget-order 789012
```

### adgroups

List ad groups for a campaign.

```bash
apple-ads-cli adgroups 123456
apple-ads-cli adgroups 123456 --limit 50
```

Options:
- `--limit <n>` -- number of results (default 20)
- `--offset <n>` -- pagination offset (default 0)

### ads

List ads for an ad group within a campaign.

```bash
apple-ads-cli ads 123456 789012
apple-ads-cli ads 123456 789012 --limit 50
```

Options:
- `--limit <n>` -- number of results (default 20)
- `--offset <n>` -- pagination offset (default 0)

### keywords

List targeting keywords for an ad group within a campaign.

```bash
apple-ads-cli keywords 123456 789012
apple-ads-cli keywords 123456 789012 --limit 50
```

Options:
- `--limit <n>` -- number of results (default 20)
- `--offset <n>` -- pagination offset (default 0)

### negative-keywords

List negative keywords for an ad group.

```bash
apple-ads-cli negative-keywords 123456 789012
```

Options:
- `--limit <n>` -- number of results (default 20)
- `--offset <n>` -- pagination offset (default 0)

### campaign-negative-keywords

List campaign-level negative keywords.

```bash
apple-ads-cli campaign-negative-keywords 123456
```

Options:
- `--limit <n>` -- number of results (default 20)
- `--offset <n>` -- pagination offset (default 0)

### report

Get a campaign-level performance report.

```bash
apple-ads-cli report 123456 \
  --start-date 2026-03-01 \
  --end-date 2026-03-15 \
  --granularity DAILY

# With grouping
apple-ads-cli report 123456 \
  --start-date 2026-03-01 \
  --end-date 2026-03-15 \
  --granularity DAILY \
  --group-by countryOrRegion,deviceClass
```

Options:
- `--start-date <date>` -- start date, YYYY-MM-DD (required)
- `--end-date <date>` -- end date, YYYY-MM-DD (required)
- `--granularity <gran>` -- HOURLY, DAILY, WEEKLY, MONTHLY (default DAILY)
- `--group-by <fields>` -- group by fields, comma-separated (e.g. countryOrRegion, deviceClass, ageRange, gender)
- `--return-records-with-no-metrics` -- include records with no metrics

### report-adgroups

Get an ad group-level report for a campaign.

```bash
apple-ads-cli report-adgroups 123456 \
  --start-date 2026-03-01 \
  --end-date 2026-03-15
```

Options:
- `--start-date <date>` -- start date, YYYY-MM-DD (required)
- `--end-date <date>` -- end date, YYYY-MM-DD (required)
- `--granularity <gran>` -- HOURLY, DAILY, WEEKLY, MONTHLY (default DAILY)

### report-keywords

Get a keyword-level report for a campaign.

```bash
apple-ads-cli report-keywords 123456 \
  --start-date 2026-03-01 \
  --end-date 2026-03-15
```

Options:
- `--start-date <date>` -- start date, YYYY-MM-DD (required)
- `--end-date <date>` -- end date, YYYY-MM-DD (required)
- `--granularity <gran>` -- HOURLY, DAILY, WEEKLY, MONTHLY (default DAILY)

## Error output

Errors are written to stderr as JSON with an `error` field and a non-zero exit code:

```json
{"error": "unauthorized"}
```

## API Reference

- Official docs: https://developer.apple.com/documentation/apple_search_ads
- OAuth setup: https://developer.apple.com/documentation/apple_search_ads/implementing_oauth_for_the_apple_search_ads_api
- API changelog: https://developer.apple.com/documentation/apple_search_ads/apple_search_ads_campaign_management_api_5

## Related

- [google-analytics-cli](https://github.com/Bin-Huang/google-analytics-cli) -- Google Analytics CLI for AI agents
- [google-search-console-cli](https://github.com/Bin-Huang/google-search-console-cli) -- Google Search Console CLI for AI agents
- [tiktok-ads-cli](https://github.com/Bin-Huang/tiktok-ads-cli) -- TikTok Ads CLI for AI agents
- [x-ads-cli](https://github.com/Bin-Huang/x-ads-cli) -- X Ads CLI for AI agents
- [reddit-ads-cli](https://github.com/Bin-Huang/reddit-ads-cli) -- Reddit Ads CLI for AI agents
- [pinterest-ads-cli](https://github.com/Bin-Huang/pinterest-ads-cli) -- Pinterest Ads CLI for AI agents

## License

Apache-2.0
