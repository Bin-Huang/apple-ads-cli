# apple-search-ads-cli

An Apple Search Ads CLI designed for AI agents. Wraps the official Apple Ads Campaign Management API (v5) with simple, agent-friendly commands.

**Works with:** OpenClaw, Claude Code, Cursor, Codex, and any agent that can run shell commands.

## Installation

```bash
npm install -g apple-search-ads-cli
```

Or run directly with npx:

```bash
npx apple-search-ads-cli --help
```

## How it works

This CLI is a thin wrapper around the official [Apple Ads Campaign Management API v5](https://developer.apple.com/documentation/apple_search_ads). It uses OAuth2 Bearer token authentication with the `X-AP-Context` organization header, and returns all API responses as JSON. No transformation or aggregation.

Core endpoints covered:

- **[ACL / Me](https://developer.apple.com/documentation/apple_search_ads/calling_the_apple_search_ads_api)** -- user access control and identity
- **[Campaigns](https://developer.apple.com/documentation/apple_search_ads/campaigns)** -- list and inspect campaigns
- **[Ad Groups](https://developer.apple.com/documentation/apple_search_ads/campaigns)** -- list ad groups under a campaign
- **[Keywords](https://developer.apple.com/documentation/apple_search_ads/campaigns)** -- list targeting keywords for an ad group
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

Create a JWT client secret signed with your private key, then exchange it for an access token. See [Apple's OAuth guide](https://developer.apple.com/documentation/apple_search_ads/implementing_oauth_for_the_apple_search_ads_api) for the full process.

The token exchange endpoint is:

```
POST https://appleid.apple.com/auth/oauth2/token
```

### Step 4: Place the credentials file

Choose one of these options:

```bash
# Option A: Default path (recommended)
mkdir -p ~/.config/apple-search-ads-cli
cat > ~/.config/apple-search-ads-cli/credentials.json << EOF
{
  "access_token": "YOUR_ACCESS_TOKEN",
  "org_id": "YOUR_ORG_ID"
}
EOF

# Option B: Environment variables
export APPLE_ADS_ACCESS_TOKEN=your_access_token
export APPLE_ADS_ORG_ID=your_org_id

# Option C: Pass per command
apple-search-ads-cli --credentials /path/to/credentials.json campaigns
```

Your `org_id` is the organization identifier shown in the Apple Search Ads UI. You can also retrieve it using the `acl` command.

Credentials are resolved in this order:
1. `--credentials <path>` flag
2. `APPLE_ADS_ACCESS_TOKEN` and `APPLE_ADS_ORG_ID` env vars
3. `~/.config/apple-search-ads-cli/credentials.json` (auto-detected)

## Usage

All commands output pretty-printed JSON by default. Use `--format compact` for compact single-line JSON.

### acl

Get the user access control list for all organizations.

```bash
apple-search-ads-cli acl
```

### me

Get details of the authenticated API user.

```bash
apple-search-ads-cli me
```

### campaigns

List all campaigns.

```bash
apple-search-ads-cli campaigns
apple-search-ads-cli campaigns --limit 50 --offset 0
```

### campaign

Get a specific campaign by ID.

```bash
apple-search-ads-cli campaign 123456
```

### adgroups

List ad groups for a campaign.

```bash
apple-search-ads-cli adgroups 123456
apple-search-ads-cli adgroups 123456 --limit 50
```

### keywords

List targeting keywords for an ad group.

```bash
apple-search-ads-cli keywords 123456 789012
```

### report

Get a campaign-level performance report.

```bash
apple-search-ads-cli report 123456 \
  --start-date 2026-03-01 \
  --end-date 2026-03-15 \
  --granularity DAILY

# With grouping
apple-search-ads-cli report 123456 \
  --start-date 2026-03-01 \
  --end-date 2026-03-15 \
  --granularity DAILY \
  --group-by countryOrRegion,deviceClass
```

### report-adgroups

Get an ad group-level report for a campaign.

```bash
apple-search-ads-cli report-adgroups 123456 \
  --start-date 2026-03-01 \
  --end-date 2026-03-15
```

### report-keywords

Get a keyword-level report for a campaign.

```bash
apple-search-ads-cli report-keywords 123456 \
  --start-date 2026-03-01 \
  --end-date 2026-03-15
```

## Error output

Errors are written to stderr as JSON with an `error` field and a non-zero exit code:

```json
{"error": "unauthorized"}
```

## API Reference

- Official docs: https://developer.apple.com/documentation/apple_search_ads
- OAuth setup: https://developer.apple.com/documentation/apple_search_ads/implementing_oauth_for_the_apple_search_ads_api

## Related

- [google-analytics-cli](https://github.com/Bin-Huang/google-analytics-cli) -- Google Analytics CLI for AI agents
- [google-search-console-cli](https://github.com/Bin-Huang/google-search-console-cli) -- Google Search Console CLI for AI agents
- [tiktok-ads-cli](https://github.com/Bin-Huang/tiktok-ads-cli) -- TikTok Ads CLI for AI agents
- [x-ads-cli](https://github.com/Bin-Huang/x-ads-cli) -- X Ads CLI for AI agents
- [reddit-ads-cli](https://github.com/Bin-Huang/reddit-ads-cli) -- Reddit Ads CLI for AI agents

## License

Apache-2.0
