// Generated from Apple's Platform API docs (Appendix A/B of the research notes). Live behaviour can differ.
export const FILTERS: Record<string, { endpoint: string; fields: Array<{ field: string; type: string; operators: string[] }> }> = {
  "campaigns": {
    "endpoint": "POST /v1/campaigns/query",
    "fields": [
      {
        "field": "id",
        "type": "integer",
        "operators": [
          "EQUALS",
          "IN"
        ]
      },
      {
        "field": "name",
        "type": "string",
        "operators": [
          "EQUALS",
          "IN",
          "LIKE",
          "STARTS_WITH",
          "ENDS_WITH"
        ]
      },
      {
        "field": "status",
        "type": "string (enum)",
        "operators": [
          "EQUALS",
          "IN"
        ]
      },
      {
        "field": "systemStatus",
        "type": "string (enum)",
        "operators": [
          "EQUALS",
          "IN"
        ]
      },
      {
        "field": "systemStatusReasons",
        "type": "array of strings",
        "operators": [
          "CONTAINS_ANY",
          "CONTAINS_ALL",
          "NOT_CONTAINS_ANY",
          "NOT_CONTAINS_ALL"
        ]
      },
      {
        "field": "systemStatusLimitingReasons",
        "type": "array of strings",
        "operators": [
          "CONTAINS_ANY",
          "CONTAINS_ALL",
          "NOT_CONTAINS_ANY",
          "NOT_CONTAINS_ALL"
        ]
      },
      {
        "field": "billingEvent",
        "type": "string (enum)",
        "operators": [
          "EQUALS",
          "IN"
        ]
      },
      {
        "field": "paymentModel",
        "type": "string (enum)",
        "operators": [
          "EQUALS",
          "IN"
        ]
      },
      {
        "field": "promotedObjectType",
        "type": "string (enum)",
        "operators": [
          "EQUALS",
          "NOT_EQUALS",
          "IN",
          "NOT_IN"
        ]
      },
      {
        "field": "promotedObjectId",
        "type": "string",
        "operators": [
          "EQUALS",
          "NOT_EQUALS",
          "IN",
          "NOT_IN"
        ]
      },
      {
        "field": "startTime",
        "type": "string (ISO 8601)",
        "operators": [
          "EQUALS",
          "NOT_EQUALS",
          "GREATER_THAN",
          "GREATER_THAN_OR_EQUAL_TO",
          "LESS_THAN",
          "LESS_THAN_OR_EQUAL_TO"
        ]
      },
      {
        "field": "endTime",
        "type": "string (ISO 8601)",
        "operators": [
          "EQUALS",
          "NOT_EQUALS",
          "GREATER_THAN",
          "GREATER_THAN_OR_EQUAL_TO",
          "LESS_THAN",
          "LESS_THAN_OR_EQUAL_TO"
        ]
      },
      {
        "field": "creationTime",
        "type": "string (ISO 8601)",
        "operators": [
          "EQUALS",
          "NOT_EQUALS",
          "GREATER_THAN",
          "GREATER_THAN_OR_EQUAL_TO",
          "LESS_THAN",
          "LESS_THAN_OR_EQUAL_TO"
        ]
      },
      {
        "field": "modificationTime",
        "type": "string (ISO 8601)",
        "operators": [
          "EQUALS",
          "NOT_EQUALS",
          "GREATER_THAN",
          "GREATER_THAN_OR_EQUAL_TO",
          "LESS_THAN",
          "LESS_THAN_OR_EQUAL_TO"
        ]
      },
      {
        "field": "deleted",
        "type": "boolean",
        "operators": [
          "EQUALS",
          "IN"
        ]
      }
    ]
  },
  "ad-groups": {
    "endpoint": "POST /v1/adgroups/query",
    "fields": [
      {
        "field": "id",
        "type": "integer",
        "operators": [
          "EQUALS",
          "IN"
        ]
      },
      {
        "field": "campaignId",
        "type": "integer",
        "operators": [
          "EQUALS"
        ]
      },
      {
        "field": "name",
        "type": "string",
        "operators": [
          "EQUALS",
          "STARTS_WITH"
        ]
      },
      {
        "field": "status",
        "type": "string (enum)",
        "operators": [
          "EQUALS",
          "IN"
        ]
      },
      {
        "field": "startTime",
        "type": "string (ISO 8601)",
        "operators": [
          "LESS_THAN",
          "GREATER_THAN"
        ]
      },
      {
        "field": "endTime",
        "type": "string (ISO 8601)",
        "operators": [
          "LESS_THAN",
          "GREATER_THAN"
        ]
      },
      {
        "field": "deleted",
        "type": "boolean",
        "operators": [
          "EQUALS"
        ]
      }
    ]
  },
  "keywords": {
    "endpoint": "POST /v1/keywords/query",
    "fields": [
      {
        "field": "id",
        "type": "integer",
        "operators": [
          "EQUALS",
          "IN"
        ]
      },
      {
        "field": "adGroupId",
        "type": "integer",
        "operators": [
          "EQUALS",
          "IN"
        ]
      },
      {
        "field": "campaignId",
        "type": "integer",
        "operators": [
          "EQUALS"
        ]
      },
      {
        "field": "text",
        "type": "string",
        "operators": [
          "EQUALS",
          "STARTS_WITH"
        ]
      },
      {
        "field": "matchType",
        "type": "string (enum)",
        "operators": [
          "EQUALS",
          "IN"
        ]
      },
      {
        "field": "status",
        "type": "string (enum)",
        "operators": [
          "EQUALS",
          "IN"
        ]
      },
      {
        "field": "deleted",
        "type": "boolean",
        "operators": [
          "EQUALS"
        ]
      }
    ]
  },
  "negatives": {
    "endpoint": "POST /v1/negative-keywords/query",
    "fields": [
      {
        "field": "id",
        "type": "integer",
        "operators": [
          "EQUALS",
          "IN"
        ]
      },
      {
        "field": "adGroupId",
        "type": "integer",
        "operators": [
          "EQUALS",
          "IN",
          "NOT_EQUALS",
          "IS_NULL",
          "IS_NOT_NULL"
        ]
      },
      {
        "field": "campaignId",
        "type": "integer",
        "operators": [
          "EQUALS"
        ]
      },
      {
        "field": "text",
        "type": "string",
        "operators": [
          "EQUALS",
          "STARTS_WITH"
        ]
      },
      {
        "field": "matchType",
        "type": "string (enum)",
        "operators": [
          "EQUALS",
          "IN"
        ]
      },
      {
        "field": "status",
        "type": "string (enum)",
        "operators": [
          "EQUALS",
          "IN"
        ]
      },
      {
        "field": "deleted",
        "type": "boolean",
        "operators": [
          "EQUALS"
        ]
      }
    ]
  },
  "ads": {
    "endpoint": "POST /v1/ads/query",
    "fields": [
      {
        "field": "id",
        "type": "integer",
        "operators": [
          "EQUALS",
          "IN"
        ]
      },
      {
        "field": "campaignId",
        "type": "integer",
        "operators": [
          "EQUALS"
        ]
      },
      {
        "field": "adGroupId",
        "type": "integer",
        "operators": [
          "EQUALS"
        ]
      },
      {
        "field": "creativeId",
        "type": "integer",
        "operators": [
          "EQUALS"
        ]
      },
      {
        "field": "status",
        "type": "string (enum)",
        "operators": [
          "EQUALS",
          "IN"
        ]
      },
      {
        "field": "deleted",
        "type": "boolean",
        "operators": [
          "EQUALS"
        ]
      }
    ]
  },
  "creatives": {
    "endpoint": "POST /v1/creatives/query",
    "fields": [
      {
        "field": "id",
        "type": "integer",
        "operators": [
          "EQUALS",
          "IN"
        ]
      },
      {
        "field": "adAccountId",
        "type": "integer",
        "operators": [
          "EQUALS"
        ]
      },
      {
        "field": "name",
        "type": "string",
        "operators": [
          "EQUALS",
          "STARTS_WITH"
        ]
      },
      {
        "field": "creativeType",
        "type": "string (enum)",
        "operators": [
          "EQUALS",
          "IN"
        ]
      },
      {
        "field": "systemStatus",
        "type": "string (enum)",
        "operators": [
          "EQUALS",
          "IN"
        ]
      },
      {
        "field": "deleted",
        "type": "boolean",
        "operators": [
          "EQUALS"
        ]
      }
    ]
  },
  "budget-orders": {
    "endpoint": "POST /v1/shared-budgets/query",
    "fields": [
      {
        "field": "deleted",
        "type": "boolean",
        "operators": [
          "EQUALS",
          "IN"
        ]
      },
      {
        "field": "id",
        "type": "integer",
        "operators": [
          "EQUALS",
          "IN"
        ]
      },
      {
        "field": "name",
        "type": "string",
        "operators": [
          "EQUALS",
          "IN",
          "LIKE",
          "STARTS_WITH",
          "ENDS_WITH"
        ]
      },
      {
        "field": "orgId",
        "type": "integer",
        "operators": [
          "EQUALS"
        ]
      },
      {
        "field": "adAccountIds",
        "type": "array of integers",
        "operators": [
          "EQUALS",
          "IN"
        ]
      },
      {
        "field": "systemStatus",
        "type": "string (enum)",
        "operators": [
          "EQUALS",
          "IN"
        ]
      },
      {
        "field": "systemStatusReasons",
        "type": "array of strings (enum)",
        "operators": [
          "CONTAINS_ANY",
          "CONTAINS_ALL",
          "NOT_CONTAINS_ANY",
          "NOT_CONTAINS_ALL",
          "IS_NULL",
          "IS_NOT_NULL"
        ]
      },
      {
        "field": "startTime",
        "type": "string (date-time)",
        "operators": [
          "EQUALS",
          "NOT_EQUALS",
          "GREATER_THAN",
          "GREATER_THAN_OR_EQUAL_TO",
          "LESS_THAN",
          "LESS_THAN_OR_EQUAL_TO"
        ]
      },
      {
        "field": "endTime",
        "type": "string (date-time)",
        "operators": [
          "EQUALS",
          "NOT_EQUALS",
          "GREATER_THAN",
          "GREATER_THAN_OR_EQUAL_TO",
          "LESS_THAN",
          "LESS_THAN_OR_EQUAL_TO"
        ]
      },
      {
        "field": "creationTime",
        "type": "string (date-time)",
        "operators": [
          "EQUALS",
          "NOT_EQUALS",
          "GREATER_THAN",
          "GREATER_THAN_OR_EQUAL_TO",
          "LESS_THAN",
          "LESS_THAN_OR_EQUAL_TO"
        ]
      },
      {
        "field": "modificationTime",
        "type": "string (date-time)",
        "operators": [
          "EQUALS",
          "NOT_EQUALS",
          "GREATER_THAN",
          "GREATER_THAN_OR_EQUAL_TO",
          "LESS_THAN",
          "LESS_THAN_OR_EQUAL_TO"
        ]
      }
    ]
  },
  "product-pages": {
    "endpoint": "POST /v1/product-pages/query",
    "fields": [
      {
        "field": "adamId",
        "type": "integer",
        "operators": [
          "EQUALS"
        ]
      },
      {
        "field": "state",
        "type": "string",
        "operators": [
          "EQUALS"
        ]
      }
    ]
  },
  "eligibility": {
    "endpoint": "POST /v1/eligibilities/apps/query",
    "fields": [
      {
        "field": "adamId",
        "type": "integer (int64)",
        "operators": [
          "EQUALS"
        ]
      },
      {
        "field": "supplyPlacement",
        "type": "string",
        "operators": [
          "EQUALS",
          "IN"
        ]
      },
      {
        "field": "state",
        "type": "string",
        "operators": [
          "EQUALS",
          "IN"
        ]
      },
      {
        "field": "countryOrRegion",
        "type": "string",
        "operators": [
          "EQUALS",
          "IN"
        ]
      },
      {
        "field": "deviceClass",
        "type": "string",
        "operators": [
          "EQUALS",
          "IN"
        ]
      }
    ]
  },
  "keyword-suggestions": {
    "endpoint": "POST /v1/suggestions/keywords/query",
    "fields": [
      {
        "field": "promotedObjectId",
        "type": "string",
        "operators": [
          "EQUALS"
        ]
      },
      {
        "field": "promotedObjectType",
        "type": "string (enum)",
        "operators": [
          "EQUALS"
        ]
      },
      {
        "field": "terms",
        "type": "array of strings",
        "operators": [
          "IN"
        ]
      },
      {
        "field": "countriesOrRegions",
        "type": "array of strings",
        "operators": [
          "IN"
        ]
      }
    ]
  },
  "impression-share": {
    "endpoint": "POST /v1/insights/apps/impression-share/query",
    "fields": [
      {
        "field": "promotedObjectId",
        "type": "string",
        "operators": [
          "IN"
        ]
      },
      {
        "field": "countryOrRegion",
        "type": "string",
        "operators": [
          "EQUALS",
          "IN"
        ]
      },
      {
        "field": "day",
        "type": "string (date)",
        "operators": [
          "IN",
          "BETWEEN"
        ]
      },
      {
        "field": "week",
        "type": "string (date)",
        "operators": [
          "IN"
        ]
      },
      {
        "field": "appName",
        "type": "string",
        "operators": [
          "EQUALS",
          "IN",
          "CONTAINS",
          "STARTS_WITH"
        ]
      },
      {
        "field": "searchTerm",
        "type": "string",
        "operators": [
          "EQUALS",
          "IN",
          "CONTAINS",
          "STARTS_WITH"
        ]
      },
      {
        "field": "lowImpressionShare",
        "type": "number",
        "operators": [
          "GREATER_THAN",
          "GREATER_THAN_OR_EQUAL_TO",
          "LESS_THAN",
          "LESS_THAN_OR_EQUAL_TO",
          "BETWEEN"
        ]
      },
      {
        "field": "highImpressionShare",
        "type": "number",
        "operators": [
          "GREATER_THAN",
          "GREATER_THAN_OR_EQUAL_TO",
          "LESS_THAN",
          "LESS_THAN_OR_EQUAL_TO",
          "BETWEEN"
        ]
      },
      {
        "field": "rank",
        "type": "integer",
        "operators": [
          "EQUALS",
          "GREATER_THAN",
          "GREATER_THAN_OR_EQUAL_TO",
          "LESS_THAN",
          "LESS_THAN_OR_EQUAL_TO",
          "BETWEEN"
        ]
      },
      {
        "field": "searchPopularity1to5",
        "type": "integer",
        "operators": [
          "EQUALS",
          "GREATER_THAN",
          "GREATER_THAN_OR_EQUAL_TO",
          "LESS_THAN",
          "LESS_THAN_OR_EQUAL_TO",
          "BETWEEN"
        ]
      }
    ]
  },
  "history": {
    "endpoint": "POST /v1/change-history/query",
    "fields": [
      {
        "field": "eventTime",
        "type": "date-time (required)",
        "operators": [
          "BETWEEN",
          "GREATER_THAN",
          "LESS_THAN"
        ]
      },
      {
        "field": "entityType",
        "type": "string",
        "operators": [
          "IN"
        ]
      },
      {
        "field": "eventType",
        "type": "CREATE|UPDATE|DELETE",
        "operators": [
          "IN"
        ]
      },
      {
        "field": "userType",
        "type": "CUSTOMER|CUSTOMER_API|APPLE_SUPPORT",
        "operators": [
          "IN"
        ]
      },
      {
        "field": "campaignId",
        "type": "integer",
        "operators": [
          "EQUALS"
        ]
      },
      {
        "field": "adGroupId",
        "type": "integer",
        "operators": [
          "EQUALS"
        ]
      },
      {
        "field": "entityId",
        "type": "integer",
        "operators": [
          "EQUALS"
        ]
      },
      {
        "field": "txnId",
        "type": "string",
        "operators": [
          "EQUALS"
        ]
      },
      {
        "field": "userId",
        "type": "string",
        "operators": [
          "EQUALS"
        ]
      }
    ]
  }
};

export const ENUMS: Record<string, string[]> = {
  "adaccountsystemstatus": [
    "ACTIVE",
    "INACTIVE"
  ],
  "adaccountsystemstatusreason": [
    "CHARGE_BACK_DISPUTED",
    "CREDIT_CARD_SUSPENDED",
    "ORG_PAYMENT_TYPE_DECLINED",
    "FRAUD",
    "INVALID_PAYMENT_PROFILE",
    "MSA_EXPIRED",
    "MSA_NOT_RECEIVED",
    "NO_PAYMENT_METHOD_ON_FILE",
    "ORG_NO_PAYMENT_METHOD_ON_FILE",
    "PAYMENT_DECLINED",
    "PAYMENT_METHOD_CANCELED",
    "PAYMENT_METHOD_ON_HOLD",
    "PAYMENT_PENDING_CHARGES",
    "LOC_EXHAUSTED",
    "POLICY_VIOLATION",
    "TAX_VERIFICATION_PENDING",
    "TERM_NOT_ACCEPTED",
    "USER_REQUESTED_ACCOUNT_SUSPENSION"
  ],
  "addisplaystatus": [
    "RUNNING",
    "PAUSED",
    "ON_HOLD",
    "LIMITED",
    "PROCESSING",
    "DELETED",
    "AD_GROUP_ON_HOLD",
    "CAMPAIGN_ON_HOLD"
  ],
  "adgroupdisplaystatus": [
    "CAMPAIGN_ON_HOLD",
    "DELETED",
    "LIMITED",
    "ON_HOLD",
    "PAUSED",
    "PROCESSING",
    "RUNNING"
  ],
  "adgroupstatus": [
    "ENABLED",
    "PAUSED"
  ],
  "adgroupsystemlimitedstatusreason": [
    "LOCATION_POLICY_ISSUES",
    "LOCATION_GROUP_ISSUES",
    "ADS_LIMITED"
  ],
  "adgroupsystemstatus": [
    "RUNNING",
    "NOT_RUNNING"
  ],
  "adgroupsystemstatusreason": [
    "PROCESSING",
    "PAUSED_BY_SYSTEM",
    "PAUSED_BY_USER",
    "DELETED_BY_USER",
    "SCHEDULE_PENDING",
    "SCHEDULE_EXPIRED",
    "TARGETED_DEVICE_CLASS_NOT_SUPPORTED_SUPPLY_PLACEMENT",
    "PENDING_AUDIENCE_VERIFICATION",
    "AUDIENCE_BELOW_THRESHOLD",
    "CAMPAIGN_NOT_RUNNING",
    "ADS_NOT_RUNNING",
    "AUTOMATED_KEYWORDS_REQUIRED_AD_GROUP_NOT_ALLOWED_IN_MANUAL_CAMPAIGNS",
    "KEYWORDS_MISSING"
  ],
  "adstatus": [
    "ENABLED",
    "PAUSED"
  ],
  "adsystemlimitedstatusreason": [
    "CREATIVE_POLICY_ISSUES"
  ],
  "adsystemstatus": [
    "RUNNING",
    "NOT_RUNNING"
  ],
  "adsystemstatusreason": [
    "PROCESSING",
    "PAUSED_BY_USER",
    "PAUSED_BY_SYSTEM",
    "DELETED_BY_USER",
    "AD_APPROVAL_PENDING",
    "AD_APPROVAL_REJECTED",
    "AD_APPROVAL_CREATIVE_DOC_EXPIRED",
    "AD_APPROVAL_CREATIVE_DOC_NOT_SUBMITTED",
    "AD_APPROVAL_CREATIVE_DOC_PENDING",
    "AD_APPROVAL_CREATIVE_DOC_REJECTED",
    "CREATIVE_SET_INVALID",
    "CREATIVE_SET_UNSUPPORTED",
    "CREATIVE_INVALID",
    "CREATIVE_PENDING",
    "PRODUCT_PAGE_DELETED",
    "PRODUCT_PAGE_HIDDEN",
    "PRODUCT_PAGE_INSUFFICIENT_ASSETS",
    "PRODUCT_PAGE_UNAVAILABLE",
    "PRODUCT_PAGE_INCOMPATIBLE",
    "CREATIVE_LOCALE_INCOMPATIBLE"
  ],
  "advertiserresourcetype": [
    "CONTENT_PROVIDER",
    "BUSINESS_BRAND"
  ],
  "asseteligibilitystatus": [
    "ELIGIBLE",
    "INELIGIBLE",
    "LIMITED",
    "PENDING",
    "UNDEFINED"
  ],
  "assettype": [
    "IMAGE"
  ],
  "auditeventtype": [
    "CREATE",
    "UPDATE",
    "DELETE"
  ],
  "auditoperator": [
    "EQUALS",
    "IN",
    "LESS_THAN",
    "LESS_THAN_OR_EQUAL_TO",
    "GREATER_THAN",
    "GREATER_THAN_OR_EQUAL_TO",
    "BETWEEN"
  ],
  "auditsortorder": [
    "ASC",
    "DESC"
  ],
  "auditusertype": [
    "CUSTOMER",
    "CUSTOMER_API",
    "APPLE_SUPPORT"
  ],
  "bidstrategygoal": [
    "IMPRESSION",
    "INSTALL",
    "TAP"
  ],
  "bidstrategytype": [
    "MANUAL_CPT",
    "MANUAL_CPM",
    "MAX_CONVERSIONS",
    "MAX_ENGAGEMENTS"
  ],
  "billingevent": [
    "TAPS",
    "IMPRESSIONS"
  ],
  "budgetsystemstatus": [
    "ACTIVE",
    "INACTIVE"
  ],
  "budgetsystemstatusreason": [
    "CANCELED",
    "CAMPAIGN_BUDGET_UNASSIGNED",
    "DELETED_BY_USER",
    "EXHAUSTED",
    "PROCESSING",
    "SCHEDULE_EXPIRED",
    "SCHEDULE_PENDING"
  ],
  "campaigndisplaystatus": [
    "RUNNING",
    "PAUSED",
    "ON_HOLD",
    "LIMITED",
    "PROCESSING",
    "DELETED"
  ],
  "campaignstatus": [
    "ENABLED",
    "PAUSED"
  ],
  "campaignsystemlimitedstatusreason": [
    "FEATURE_NOT_AVAILABLE_IN_COUNTRY_OR_REGION",
    "ACCOUNT_DOC_APPROVAL_EXPIRED",
    "ACCOUNT_DOC_APPROVAL_INFECTED",
    "ACCOUNT_DOC_APPROVAL_NOT_SUBMITTED",
    "ACCOUNT_DOC_APPROVAL_PENDING",
    "ACCOUNT_DOC_APPROVAL_REJECTED",
    "APP_CONTENT_REJECTED",
    "APP_CONTENT_REVIEW_PENDING",
    "APP_DOC_APPROVAL_EXPIRED",
    "APP_DOC_APPROVAL_INFECTED",
    "APP_DOC_APPROVAL_NOT_SUBMITTED",
    "APP_DOC_APPROVAL_PENDING",
    "APP_DOC_APPROVAL_REJECTED",
    "APP_NOT_ELIGIBLE",
    "APP_NOT_ELIGIBLE_SEARCHADS",
    "APP_NOT_ELIGIBLE_SUPPLY_SOURCE",
    "APP_NOT_ELIGIBLE_SUPPLY_PLACEMENT",
    "APP_LANGUAGE_INCOMPATIBLE",
    "APP_NOT_PUBLISHED_YET",
    "SAPIN_LAW_AGENT_UNKNOWN",
    "SAPIN_LAW_FRENCH_BIZ",
    "SAPIN_LAW_FRENCH_BIZ_UNKNOWN",
    "BRAND_POLICY_ISSUES",
    "AD_GROUPS_LIMITED"
  ],
  "campaignsystemstatus": [
    "RUNNING",
    "NOT_RUNNING"
  ],
  "campaignsystemstatusreason": [
    "PROCESSING",
    "PAUSED_BY_SYSTEM",
    "FEATURE_NOT_YET_AVAILABLE",
    "FEATURE_NO_LONGER_AVAILABLE",
    "PAUSED_BY_USER",
    "DELETED_BY_USER",
    "USER_REQUESTED_ACCOUNT_SUSPENSION",
    "CAMPAIGN_DELETED_FOR_BASIC_MSF_MIGRATION",
    "SCHEDULE_PENDING",
    "SCHEDULE_EXPIRED",
    "APP_NOT_ELIGIBLE",
    "APP_NOT_ELIGIBLE_SEARCHADS",
    "APP_NOT_ELIGIBLE_SUPPLY_PLACEMENT",
    "APP_NOT_PUBLISHED_YET",
    "APP_NOT_CATEGORIZED",
    "APP_SENSITIVE_CONTENT",
    "APP_DOC_APPROVAL_REJECTED",
    "COUNTRIES_OR_REGIONS_NOT_ELIGIBLE",
    "SAPIN_LAW_AGENT_UNKNOWN",
    "SAPIN_LAW_FRENCH_BIZ",
    "SAPIN_LAW_FRENCH_BIZ_UNKNOWN",
    "BUDGET_ORDER_EXHAUSTED",
    "BUDGET_ORDER_SCHEDULE_PENDING",
    "BUDGET_ORDER_SCHEDULE_EXPIRED",
    "BUDGET_ORDER_CANCELED",
    "BUDGET_ORDER_OR_INVOICE_DETAIL_MISSING",
    "LIFETIME_BUDGET_EXHAUSTED",
    "MONTHLY_BUDGET_EXHAUSTED",
    "LINE_OF_CREDIT_EXHAUSTED",
    "ORG_PAYMENT_TYPE_DECLINED",
    "TAX_VERIFICATION_PENDING",
    "AD_ACCOUNT_PAYMENT_ISSUES",
    "ORG_NO_PAYMENT_METHOD_ON_FILE",
    "ORG_CHARGE_BACK_DISPUTED",
    "ORG_PAYMENT_METHOD_CHANGED",
    "ORG_SUSPENDED_FRAUD",
    "ORG_SUSPENDED_POLICY_VIOLATION",
    "CONTENT_PROVIDER_UNLINKED",
    "AD_ACCOUNT_BRAND_DELEGATION_ISSUES",
    "AD_GROUPS_MISSING",
    "AD_GROUPS_NOT_RUNNING",
    "AUTOMATED_KEYWORDS_REQUIRED_AD_GROUP_MISSING",
    "AUTOMATED_KEYWORDS_REQUIRED_AD_GROUP_NOT_RUNNING"
  ],
  "creativesystemstatus": [
    "VALID",
    "INVALID",
    "PENDING"
  ],
  "creativesystemstatusreason": [
    "NEEDS_REVIEW",
    "POLICY_PROHIBITED",
    "POLICY_UNDEFINED",
    "PENDING_ASSET_CHECKS",
    "MISSING_ASSET",
    "ASSET_DELETED",
    "FAILED_ASSET_RATIO_COMPATIBILITY",
    "CREATIVE_ASSET_UNAVAILABLE",
    "CREATIVE_ASSET_PENDING_AVAILABILITY",
    "PRODUCT_PAGE_DELETED",
    "PRODUCT_PAGE_HIDDEN",
    "PRODUCT_PAGE_UNAVAILABLE",
    "PAUSED_BY_USER",
    "DELETED_BY_USER"
  ],
  "creativetype": [
    "CUSTOM_PRODUCT_PAGE",
    "DEFAULT_PRODUCT_PAGE",
    "LOCAL_ADS_SEARCH_CREATIVE"
  ],
  "currency": [
    "USD",
    "RMB",
    "AUD",
    "CAD",
    "EUR",
    "GBP",
    "JPY",
    "MXN",
    "NZD",
    "RUB",
    "CNY",
    "INR",
    "BRL",
    "IDR"
  ],
  "destinationtype": [
    "APP_STORE_PRODUCT_PAGE",
    "LOCAL_ADS_PLACECARD"
  ],
  "eligibilitystatus": [
    "ELIGIBLE",
    "INELIGIBLE",
    "LIMITED",
    "PENDING",
    "UNDEFINED"
  ],
  "geoentitytype": [
    "Country",
    "AdminArea",
    "Locality",
    "PostalCode"
  ],
  "imagetype": [
    "JPEG",
    "JPG",
    "PNG",
    "HEIC",
    "HEIF",
    "SVG",
    "WEBP"
  ],
  "keyworddisplaystatus": [
    "RUNNING",
    "PAUSED",
    "DELETED",
    "AD_GROUP_ON_HOLD",
    "CAMPAIGN_ON_HOLD"
  ],
  "keywordmatchtype": [
    "EXACT",
    "BROAD",
    "PHRASE",
    "CATEGORY"
  ],
  "keywordstatus": [
    "ENABLED",
    "PAUSED"
  ],
  "locationgrouptype": [
    "DYNAMIC",
    "STATIC"
  ],
  "negativekeywordstatus": [
    "ENABLED",
    "PAUSED"
  ],
  "orgsystemstatus": [
    "ACTIVE",
    "INACTIVE"
  ],
  "orgsystemstatusreason": [
    "CHARGE_BACK_DISPUTED",
    "CREDIT_CARD_SUSPENDED",
    "ORG_PAYMENT_TYPE_DECLINED",
    "FRAUD",
    "LOC_EXHAUSTED",
    "MSA_EXPIRED",
    "MSA_NOT_RECEIVED",
    "NO_PAYMENT_METHOD_ON_FILE",
    "PAYMENT_DECLINED",
    "PAYMENT_METHOD_CANCELED",
    "PAYMENT_METHOD_ON_HOLD",
    "PAYMENT_PENDING_CHARGES",
    "POLICY_VIOLATION",
    "TAX_VERIFICATION_PENDING",
    "TERM_NOT_ACCEPTED",
    "USER_REQUESTED_ACCOUNT_SUSPENSION"
  ],
  "orientation": [
    "PORTRAIT",
    "LANDSCAPE",
    "SQUARE"
  ],
  "paymentmodel": [
    "PAYG",
    "LOC"
  ],
  "pricingmodel": [
    "CPA",
    "CPM",
    "CPT"
  ],
  "productfeatures": [
    "APPSTORE_APP_MANUAL",
    "BUSINESS_BRAND_MANUAL"
  ],
  "promotedobjecttype": [
    "APPSTORE_APP",
    "BUSINESS_BRAND"
  ],
  "queryfilteroperator": [
    "EQUALS",
    "NOT_EQUALS",
    "IN",
    "NOT_IN",
    "CONTAINS_ANY",
    "NOT_CONTAINS_ANY",
    "CONTAINS_ALL",
    "NOT_CONTAINS_ALL",
    "LIKE",
    "NOT_LIKE",
    "STARTS_WITH",
    "ENDS_WITH",
    "GREATER_THAN",
    "GREATER_THAN_OR_EQUAL_TO",
    "LESS_THAN",
    "LESS_THAN_OR_EQUAL_TO",
    "BETWEEN",
    "IS_NULL",
    "IS_NOT_NULL"
  ],
  "querysortorder": [
    "ASC",
    "DESC"
  ],
  "recommendationcategory": [
    "KEYWORD",
    "SKEYWORD",
    "DAILYCAP",
    "SDAILYCAP",
    "TCPA",
    "STCPA",
    "BID",
    "SBID"
  ],
  "recommendationfilteroperator": [
    "EQUALS",
    "NOT_EQUALS",
    "IN",
    "CONTAINS_ANY",
    "CONTAINS_ALL",
    "LESS_THAN",
    "LESS_THAN_OR_EQUAL_TO",
    "GREATER_THAN",
    "GREATER_THAN_OR_EQUAL_TO",
    "BETWEEN",
    "STARTS_WITH",
    "ENDS_WITH",
    "LIKE"
  ],
  "recommendationsortingorder": [
    "ASC",
    "DESC"
  ],
  "recommendationstate": [
    "AVAILABLE",
    "APPLIED",
    "DISMISSED",
    "DELETE"
  ],
  "recommendationstatus": [
    "ENABLED",
    "DISABLED",
    "DELETED"
  ],
  "regulationresponsevalue": [
    "AGENT",
    "NOT_AGENT",
    "FRENCH_BUSINESS",
    "NOT_FRENCH_BUSINESS",
    "TRUE",
    "FALSE",
    "NOT_ANSWERED"
  ],
  "regulationtype": [
    "CAC",
    "CAMPAIGN_SAPIN_LAW",
    "ORG_SAPIN_LAW"
  ],
  "reportingbillingevent": [
    "TAPS",
    "IMPRESSIONS"
  ],
  "reportingpricingmodel": [
    "CPA",
    "CPM",
    "CPT"
  ],
  "searchsupplysourcetype": [
    "APPSTORE",
    "MAPS"
  ]
};
