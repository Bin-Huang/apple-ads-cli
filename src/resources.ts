import type { Column } from "./output.js";

export interface Resource {
  /** Guard target type. */
  type: "campaign" | "adGroup" | "keyword" | "negative" | "creative" | "ad" | "budgetOrder";
  label: string;
  path: string;
  queryPath: string;
  schema: string;
  columns: Column[];
}

const c = (header: string, path = header): Column => ({ header, path });

export const RESOURCES = {
  campaigns: {
    type: "campaign",
    label: "campaign",
    path: "/campaigns",
    queryPath: "/campaigns/query",
    schema: "Campaign",
    columns: [c("id"), c("name"), c("status"), c("displayStatus"), c("dailyBudget"), c("countries", "targeting.countryOrRegion.include"), c("startTime"), c("endTime")],
  },
  adGroups: {
    type: "adGroup",
    label: "ad group",
    path: "/adgroups",
    queryPath: "/adgroups/query",
    schema: "AdGroup",
    columns: [c("id"), c("campaignId"), c("name"), c("status"), c("displayStatus"), c("bid", "bidStrategy.bid"), c("searchMatch", "automatedKeywordsOptIn")],
  },
  keywords: {
    type: "keyword",
    label: "keyword",
    path: "/keywords",
    queryPath: "/keywords/query",
    schema: "Keyword",
    columns: [c("id"), c("adGroupId"), c("text"), c("matchType"), c("status"), c("bid"), c("displayStatus")],
  },
  negatives: {
    type: "negative",
    label: "negative keyword",
    path: "/negative-keywords",
    queryPath: "/negative-keywords/query",
    schema: "NegativeKeyword",
    columns: [c("id"), c("scope", "cli.scope"), c("campaignId"), c("adGroupId"), c("text"), c("matchType"), c("status")],
  },
  creatives: {
    type: "creative",
    label: "creative",
    path: "/creatives",
    queryPath: "/creatives/query",
    schema: "Creative",
    columns: [c("id"), c("name"), c("creativeType"), c("systemStatus"), c("productPageId", "destination.parameters.productPageId")],
  },
  ads: {
    type: "ad",
    label: "ad",
    path: "/ads",
    queryPath: "/ads/query",
    schema: "Ad",
    columns: [c("id"), c("campaignId"), c("adGroupId"), c("creativeId"), c("name"), c("status"), c("displayStatus")],
  },
  budgetOrders: {
    type: "budgetOrder",
    label: "budget order",
    path: "/shared-budgets",
    queryPath: "/shared-budgets/query",
    schema: "SharedBudget",
    columns: [c("id"), c("name"), c("systemStatus"), c("startTime"), c("endTime")],
  },
} satisfies Record<string, Resource>;

export const REPORT_COLUMNS: Column[] = [
  c("id", "metadata.id"),
  c("name", "metadata.name"),
  c("impressions", "totalMetrics.impressions"),
  c("taps", "totalMetrics.taps"),
  c("ttr", "totalMetrics.ttr"),
  c("localSpend", "totalMetrics.localSpend"),
  c("tapInstalls", "totalMetrics.tapInstalls"),
  c("tapInstallCPI", "totalMetrics.tapInstallCPI"),
  c("tapInstallRate", "totalMetrics.tapInstallRate"),
];
