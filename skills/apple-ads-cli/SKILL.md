---
name: apple-ads-cli
description: Manages and analyses Apple Ads (formerly Apple Search Ads) App Store campaigns through apple-ads-cli on the Apple Ads Platform API v1. Covers account and access checks, campaigns, ad groups, keywords, negative keywords, creatives, ads and custom product pages, plus campaign, ad group, keyword, search term and ad reports, impression share and change history. Writes (create, pause, resume, bids, budgets, keywords) go through a dry-run and confirm protocol with a spend assessment. Use when the user asks about Apple Ads or Apple Search Ads spend, CPT, CPA, installs, taps, impressions, search terms, keyword bids, negative keywords, budget pacing or a weekly ads review, or wants to create or change an Apple Ads campaign. Not for App Store Connect metadata, builds or TestFlight.
---

# Apple Ads with apple-ads-cli

## Read first

If `references/local.md` exists next to this file, read it before anything else. It holds this machine's install path, profile, ad account and protected campaigns, and its rules override the defaults here.

## Setup check

1. Run `apple-ads-cli --version` and expect `2.x`. If the command is missing or reports 1.x, run `npm install -g apple-ads-cli` and check again. If it still reports 1.x, stop and say so: 1.x is a different tool on a retired API.
2. Run `apple-ads-cli auth doctor`. If a check has `"ok": false`, follow its `hint`.
3. Never ask for, print or paste a token or private key. To set up, ask the user to run `apple-ads-cli auth setup --client-id SEARCHADS.… --team-id SEARCHADS.… --key-id KEY_ID --private-key PATH` (values from Apple Ads > Account Settings > API; `PATH` is the key file, never the key itself).

## Hard rules

- Read before you write.
- Make no write without the user's explicit approval of that specific change.
- Always run a write with `--dry-run` first, and show the user the plan and the `spend` block.
- Create things paused. Enabling spend is a separate step, and only on instruction.
- Never touch campaigns the user did not name.
- Never print tokens or keys.
- Exit code 6 means stop and ask. Do not edit the CLI config to get past it.

## Intent to command

| The user wants | Run |
|---|---|
| How the account is doing | `apple-ads-cli reports campaigns --last 7d` |
| One campaign's trend | `reports campaigns --campaign-id ID --last 28d --granularity WEEKLY` |
| Which ad groups or keywords work | `reports ad-groups --campaign-id ID --last 28d`, `reports keywords --campaign-id ID --last 28d` |
| What people searched | `reports search-terms --campaign-id ID --last 28d` |
| Spend by country | `reports campaigns --last 7d --group-by countryOrRegion` |
| Why something is not running | `campaigns get ID`, then read `displayStatus` and `systemStatusReasons` |
| The account structure | `campaigns list`, `ad-groups list --campaign-id ID`, `ads list --campaign-id ID` |
| Keywords or negatives | `keywords list --campaign-id ID`, `negatives list --campaign-id ID` |
| Add negatives | `negatives add --campaign-id ID --text "term" --dry-run` |
| Add keywords | `keywords add --ad-group-id ID --text "term" --dry-run` |
| Change bids | `keywords update KEYWORD_ID --bid 0.55 --dry-run` |
| Pause or resume | `campaigns pause ID --dry-run` (also `ad-groups`, `ads`, `keywords`) |
| Change a budget or end date | `campaigns update ID --daily-budget 5.00 --dry-run` |
| A new campaign | `campaigns create --name … --adam-id … --daily-budget … --countries US --end YYYY-MM-DD --dry-run` |
| Impression share | `insights impression-share --adam-id APP_ID --country US --last 14d` |
| What changed recently | `history list --since 7d --campaign-id ID` |
| App ID or product pages | `apps search --owned`, `product-pages list --adam-id APP_ID` |
| Anything else | `apple-ads-cli schema commands`, or `api GET /path` |

`reports campaigns` takes an optional `--campaign-id`; every other report needs one. `--last 7d` means the 7 full days before today in the account's time zone.

## Safe write protocol

1. Read the current state (`… get ID`, or the list for the parent).
2. Run the write with `--dry-run`.
3. Show the user `plan.steps` (method, URL, body), `spend.effect`, `spend.reasons` and, for campaigns, `spend.ceilings`. Point out any reason marked `largeStep`.
4. On approval, run the same command with `--confirm` in place of `--dry-run`. Deletes also need `--force-delete`.
5. Read `after` in the output: check that the changed field (bid, budget, status, end date) matches the plan, and report each entity's `displayStatus`.
6. If a bulk write fails part-way (`PARTIAL_FAILURE` or `BULK_UNCONFIRMED`), list the parent before retrying. Items that already exist are skipped and shown under `existing`.

## Weekly review

Read `references/playbook.md` when the user asks for a review, optimisation or "what should I change". In short: check status and budget ceilings, pull 7-day and 28-day reports, mine search terms, propose bid changes of 15% or less, propose negatives, and make no write until the user approves each item.

## Output shapes

A list. If `truncated` is true, re-run with `--all` or the given offset:

```json
{"result":[{"id":111111111,"name":"Example","status":"ENABLED","displayStatus":"RUNNING"}],
 "pagination":{"offset":0,"returned":1,"totalCount":1,"truncated":false}}
```

A report. `rows: []` means no activity in the range, not a failure:

```json
{"result":{"rows":[{"metadata":{"id":111111111,"name":"Example"},
  "totalMetrics":{"impressions":1520,"taps":64,"localSpend":{"amount":"12.40","currency":"USD"},"tapInstalls":9}}],
  "grandTotal":{"impressions":1520}},
 "pagination":{"offset":0,"returned":1,"totalCount":1,"truncated":false},
 "cli":{"timeRange":{"start":"2026-11-09","end":"2026-11-15"},"provisionalFrom":"2026-11-14"}}
```

A write plan:

```json
{"dryRun":true,"sent":false,
 "plan":{"action":"campaigns.pause","steps":[{"method":"PUT","url":"https://api.ads.apple.com/v1/campaigns/111111111","body":{"status":"PAUSED"}}]},
 "spend":{"effect":"decrease","reasons":[{"effect":"decrease","text":"campaign 111111111 paused"}]}}
```

## Errors and next steps

Errors are JSON on stderr: `{"error":{"code","message","hint"}}`. Follow `hint` first.

| Exit or message | Next step |
|---|---|
| 2 usage | Fix the flag the message names; see the command's `--help`. |
| 3 auth | Run `auth doctor` and report the failing check. Do not work around it. |
| 4 not found | List the parent to get a valid ID. |
| 5 rate limit or transient | Wait a minute, then retry once. For a write, list before retrying. |
| 6 `CONFIRM_REQUIRED` | Show the plan and ask for approval. |
| 6 `PROTECTED` | Tell the user the campaign is protected and stop. |
| 6 `FORCE_DELETE_REQUIRED` | Confirm the delete with the user, then add `--force-delete`. |
| 6 `ABOVE_CEILING` | The bid or budget is above the sanity ceiling. Check for a typo (60 for 0.60); add `--allow-large` only if the user confirms the amount. |
| "adGroupId or campaignId condition is required" | Add `--campaign-id` or `--ad-group-id`. |
| "not valid for granularity" | Shorten the range or change `--granularity` (`schema reports`). |
| "Operator … is not supported" | Check `apple-ads-cli schema filters <resource>`. |
| `PARTIAL_FAILURE` | Read `results[].error`, fix those items, and re-run (existing items are skipped). |
| `BULK_UNCONFIRMED` | Apple did not confirm every item. List the parent and check each item before retrying. |

## References

- `references/commands.md`: every command with flags and an example. Read when a command or flag is not in the table above.
- `references/reports.md`: report kinds, required filters, metrics, groupBy, span rules, Low Volume and provisional days. Read before any report question that is not a simple total.
- `references/playbook.md`: account structure, match types, negatives, bids, budgets and the 10-step weekly review. Read for reviews and recommendations.
