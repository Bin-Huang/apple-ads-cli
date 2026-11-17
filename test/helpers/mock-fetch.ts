// A strict fetch mock: every request must match a route, or the test fails.
export interface MockResponse {
  status?: number;
  json?: unknown;
  text?: string;
  headers?: Record<string, string>;
  /** Throw instead of answering (network error / timeout). */
  throws?: Error;
}

export type Route = MockResponse | MockResponse[] | ((call: Call) => MockResponse);

export interface Call {
  method: string;
  url: string;
  path: string;
  headers: Record<string, string>;
  body?: any;
  rawBody?: string;
}

export interface Mock {
  fetch: typeof fetch;
  calls: Call[];
  unmatched: Call[];
  /** Calls other than GETs, token exchanges and known /query reads. */
  writes(): Call[];
}

/** Known read-only POST /query endpoints; any other non-GET call counts as a write. */
const READ_PATHS = [
  /^\/(campaigns|adgroups|keywords|negative-keywords|ads|creatives|product-pages|shared-budgets|change-history)\/query$/,
  /^\/(eligibilities\/apps|suggestions\/keywords|insights\/apps\/impression-share)\/query$/,
  /^\/reports\/apps\/(campaigns|adgroups|keywords|searchterms|ads)\/query$/,
  /^\/apps\/\d+\/locale-details\/query$/,
];

export function mockFetch(routes: Record<string, Route>): Mock {
  const calls: Call[] = [];
  const unmatched: Call[] = [];
  const queues = new Map<string, MockResponse[]>();
  const f = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(String(input));
    const method = (init.method ?? "GET").toUpperCase();
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries((init.headers ?? {}) as Record<string, string>)) headers[k.toLowerCase()] = v;
    const rawBody = typeof init.body === "string" ? init.body : undefined;
    let body: any;
    if (rawBody !== undefined) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        body = rawBody;
      }
    }
    const path = url.hostname === "api.ads.apple.com" ? url.pathname.replace(/^\/v1/, "") : `${url.hostname}${url.pathname}`;
    const call: Call = { method, url: url.toString(), path, headers, body, rawBody };
    calls.push(call);
    const key = `${method} ${path}`;
    const route = routes[key] ?? routes[`${key}${url.search}`];
    if (route === undefined) {
      unmatched.push(call);
      throw new Error(`mock-fetch: unexpected request ${key}${url.search}`);
    }
    let r: MockResponse;
    if (typeof route === "function") r = route(call);
    else if (Array.isArray(route)) {
      if (!queues.has(key)) queues.set(key, [...route]);
      const q = queues.get(key)!;
      r = q.length > 1 ? q.shift()! : q[0]!;
    } else r = route;
    if (r.throws) throw r.throws;
    const text = r.text ?? (r.json !== undefined ? JSON.stringify(r.json) : "");
    const h = new Headers(r.headers ?? {});
    if (r.json !== undefined && !h.has("content-type")) h.set("content-type", "application/json");
    return new Response(text === "" ? null : text, { status: r.status ?? 200, headers: h });
  };
  return {
    fetch: f as typeof fetch,
    calls,
    unmatched,
    writes: () => calls.filter((c) => c.method !== "GET" && !c.path.startsWith("appleid.apple.com") && !(c.method === "POST" && READ_PATHS.some((re) => re.test(c.path)))),
  };
}
