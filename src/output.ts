import { CliError } from "./errors.js";

export type Format = "json" | "table";

export interface Column {
  header: string;
  path: string;
}

export interface OutOptions {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  format: Format;
  pretty: boolean;
  debug: boolean;
}

function get(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (cur === null || cur === undefined) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function isMoney(v: unknown): v is { amount: string; currency: string } {
  return !!v && typeof v === "object" && "amount" in (v as object) && "currency" in (v as object);
}

export function cell(v: unknown, header = ""): string {
  if (v === undefined || v === null) return "";
  if (isMoney(v)) return `${Number(v.amount).toFixed(2)} ${v.currency}`;
  if (isMoney((v as { value?: unknown })?.value)) return cell((v as { value: unknown }).value);
  if (typeof v === "number" && /rate|ttr/i.test(header) && v <= 1) return `${(v * 100).toFixed(2)}%`;
  if (Array.isArray(v)) return v.map((x) => cell(x)).join(",");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function renderTable(rows: unknown[], columns: Column[]): string {
  const data = rows.map((r) => columns.map((c) => cell(get(r, c.path), c.header)));
  const widths = columns.map((c, i) => Math.min(60, Math.max(c.header.length, ...data.map((d) => d[i]!.length))));
  const fmt = (cells: string[]) =>
    cells.map((s, i) => (s.length > widths[i]! ? s.slice(0, widths[i]! - 1) + "…" : s.padEnd(widths[i]!))).join("  ").trimEnd();
  return [fmt(columns.map((c) => c.header)), fmt(widths.map((w) => "-".repeat(w))), ...data.map(fmt)].join("\n") + "\n";
}

export class Out {
  constructor(private o: OutOptions) {}

  get format(): Format {
    return this.o.format;
  }

  /** Writes the one stdout document. */
  emit(data: unknown, columns?: Column[]): void {
    if (this.o.format === "table" && columns) {
      const rows = tableRows(data);
      if (rows) {
        this.o.stdout(renderTable(rows, columns));
        return;
      }
    }
    this.o.stdout(JSON.stringify(data, null, this.o.pretty ? 2 : undefined) + "\n");
  }

  note(msg: string): void {
    this.o.stderr(`apple-ads-cli: ${msg}\n`);
  }

  debug(msg: string): void {
    if (this.o.debug) this.o.stderr(`[debug] ${msg}\n`);
  }

  get debugEnabled(): boolean {
    return this.o.debug;
  }

  error(e: CliError, stack?: string): void {
    this.o.stderr(JSON.stringify({ error: e.toJSON() }) + "\n");
    if (this.o.debug && stack) this.o.stderr(stack + "\n");
  }
}

function tableRows(data: unknown): unknown[] | undefined {
  const r = (data as { result?: unknown })?.result;
  if (Array.isArray(r)) return r;
  if (r && typeof r === "object" && Array.isArray((r as { rows?: unknown }).rows)) return (r as { rows: unknown[] }).rows;
  if (r && typeof r === "object") return [r];
  return undefined;
}
