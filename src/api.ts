import type { AppleAdsCredentials } from "./auth.js";

const BASE_URL = "https://api.searchads.apple.com/api/v5";

export interface ApiOptions {
  creds: AppleAdsCredentials;
  method?: "GET" | "POST";
  params?: Record<string, string>;
  body?: Record<string, unknown>;
}

export async function callApi(
  endpoint: string,
  opts: ApiOptions
): Promise<unknown> {
  const method = opts.method ?? "GET";
  let url = `${BASE_URL}${endpoint}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.creds.access_token}`,
    "X-AP-Context": `orgId=${opts.creds.org_id}`,
    "Content-Type": "application/json",
  };

  if (method === "GET" && opts.params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(opts.params)) {
      if (value !== undefined && value !== null && value !== "") {
        searchParams.set(key, value);
      }
    }
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
  }

  const fetchOpts: RequestInit = { method, headers };
  if (method === "POST" && opts.body) {
    fetchOpts.body = JSON.stringify(opts.body);
  }

  const res = await fetch(url, fetchOpts);
  const json = (await res.json()) as Record<string, unknown>;

  if (!res.ok) {
    const errorBody = json.error as Record<string, unknown> | undefined;
    const errors = json.errors as Array<{ message: string }> | undefined;
    const msg =
      errors?.map((e) => e.message).join("; ") ??
      (errorBody as { message?: string })?.message ??
      `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return json.data ?? json;
}
