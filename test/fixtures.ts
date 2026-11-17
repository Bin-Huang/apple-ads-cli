// Placeholder-only Apple response shapes (copied in shape from live responses).
export const CAMPAIGN = {
  id: 111111111, adAccountId: 123456789, name: "Example US Search", billingEvent: "TAPS", paymentModel: "PAYG",
  startTime: "2026-12-01T00:00:00.000", endTime: "2026-12-31T23:59:59.000", promotedObjectType: "APPSTORE_APP",
  promotedObjectId: "1234567890", status: "PAUSED", systemStatus: "NOT_RUNNING", systemStatusReasons: ["PAUSED_BY_USER"],
  systemStatusLimitingReasons: [], displayStatus: "PAUSED", dailyBudget: { value: { amount: "3.5", currency: "USD" } },
  targeting: { supplySource: { include: ["APPSTORE"] }, supplyPlacement: { include: ["APPSTORE_SEARCH_RESULTS"] }, countryOrRegion: { include: ["US"] } },
  bidStrategy: { bidStrategyType: "MANUAL_CPT", bidStrategyGoal: "TAP" }, deleted: false,
};
export const AD_GROUP = {
  id: 222222222, adAccountId: 123456789, campaignId: 111111111, name: "Example Group", pricingModel: "CPT",
  automatedKeywordsOptIn: false, status: "ENABLED", systemStatus: "RUNNING", displayStatus: "RUNNING",
  bidStrategy: { bidStrategyType: "MANUAL_CPT", bidStrategyGoal: "TAP", bid: { amount: "0.6", currency: "USD" } },
  startTime: "2026-12-01T00:00:00.000", deleted: false,
};
export const KEYWORD = { id: 333333333, adAccountId: 123456789, campaignId: 111111111, adGroupId: 222222222, text: "example term", matchType: "EXACT", status: "ENABLED", bid: { amount: "0.5", currency: "USD" }, displayStatus: "RUNNING", deleted: false };
export const NEGATIVE = { id: 444444444, campaignId: 111111111, text: "free example", matchType: "EXACT", status: "ENABLED", deleted: false };
export const AD = { id: 555555555, campaignId: 111111111, adGroupId: 222222222, creativeId: 666666, name: "Example Ad", status: "PAUSED", systemStatus: "NOT_RUNNING", displayStatus: "PAUSED", deleted: false };
export const CREATIVE = { id: 666666, adAccountId: 123456789, name: "Example CPP", creativeType: "CUSTOM_PRODUCT_PAGE", systemStatus: "VALID", systemStatusReasons: [], destination: { destinationType: "APP_STORE_PRODUCT_PAGE", parameters: { adamId: "1234567890", productPageId: "00000000-0000-0000-0000-000000000000" } }, deleted: false };
export const PRODUCT_PAGE = { adamId: 1234567890, name: "Example page", state: "VISIBLE", id: "00000000-0000-0000-0000-000000000000" };
