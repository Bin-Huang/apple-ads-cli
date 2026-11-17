import { hintFor } from "./hints.js";

export enum ExitCode {
  OK = 0,
  API = 1,
  USAGE = 2,
  AUTH = 3,
  NOT_FOUND = 4,
  RATE_LIMIT = 5,
  REFUSED = 6,
}

export interface ErrorDetail {
  code?: string;
  message?: string;
  field?: string;
}

export interface CliErrorInit {
  exitCode: ExitCode;
  code: string;
  message: string;
  hint?: string;
  status?: number;
  requestId?: string;
  details?: ErrorDetail[];
}

export class CliError extends Error {
  exitCode: ExitCode;
  code: string;
  hint?: string;
  status?: number;
  requestId?: string;
  details?: ErrorDetail[];

  constructor(init: CliErrorInit) {
    super(init.message);
    this.name = "CliError";
    this.exitCode = init.exitCode;
    this.code = init.code;
    this.hint = init.hint;
    this.status = init.status;
    this.requestId = init.requestId;
    this.details = init.details;
  }

  toJSON(): Record<string, unknown> {
    const o: Record<string, unknown> = { code: this.code, message: this.message };
    if (this.hint) o.hint = this.hint;
    if (this.status !== undefined) o.status = this.status;
    if (this.requestId) o.requestId = this.requestId;
    if (this.details?.length) o.details = this.details;
    o.exitCode = this.exitCode;
    return o;
  }
}

export function usageError(message: string, hint?: string): CliError {
  return new CliError({ exitCode: ExitCode.USAGE, code: "USAGE", message, hint });
}

export function authError(message: string, hint?: string, code = "AUTH"): CliError {
  return new CliError({ exitCode: ExitCode.AUTH, code, message, hint });
}

export function refused(code: string, message: string, hint?: string): CliError {
  return new CliError({ exitCode: ExitCode.REFUSED, code, message, hint });
}

export function exitCodeForStatus(status: number, code?: string): ExitCode {
  if (code === "ENTITY_NOT_FOUND" || status === 404) return ExitCode.NOT_FOUND;
  if (status === 401 || status === 403) return ExitCode.AUTH;
  if (status === 429 || status >= 500) return ExitCode.RATE_LIMIT;
  return ExitCode.API;
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function fieldFromInfo(info: Record<string, unknown> | undefined): string | undefined {
  if (!info) return undefined;
  if (str(info.field)) return info.field as string;
  if (Array.isArray(info.fields) && str(info.fields[0])) return info.fields[0] as string;
  if (Array.isArray(info.invalidFields) && info.invalidFields.length) return info.invalidFields.map(String).join(",");
  return undefined;
}

/** Turns any Apple error response (v1 shape, v5 shape, HTML or empty) into a CliError. */
export function parseApiError(status: number, body: unknown, requestId?: string): CliError {
  const root = asRecord(body);
  const err = asRecord(root?.error);
  let code = "HTTP_" + status;
  let message = `HTTP ${status}`;
  let details: ErrorDetail[] = [];

  if (err && Array.isArray(err.details)) {
    // v1: error{code, message?, details[{code, message, info}]}
    code = str(err.code) ?? code;
    details = err.details.map((d) => {
      const r = asRecord(d) ?? {};
      return { code: str(r.code), message: str(r.message), field: fieldFromInfo(asRecord(r.info)) };
    });
    message = str(err.message) ?? details.find((d) => d.message)?.message ?? code;
  } else if (err && Array.isArray(err.errors)) {
    // v5-style: error.errors[{messageCode, message, field}]
    details = err.errors.map((d) => {
      const r = asRecord(d) ?? {};
      return { code: str(r.messageCode), message: str(r.message), field: str(r.field) };
    });
    code = details[0]?.code ?? code;
    message = details.find((d) => d.message)?.message ?? code;
  } else if (err) {
    code = str(err.code) ?? code;
    message = str(err.message) ?? code;
  } else if (typeof body === "string" && body.trim().length > 0) {
    const text = body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
    message = `HTTP ${status}: ${text || "non-JSON response"}`;
    code = "NON_JSON_RESPONSE";
  } else if (body === undefined || body === null || body === "") {
    message = `HTTP ${status} with an empty body`;
  }

  // Prefer the detail message when the top level is generic.
  if (/^Request validation failed$/i.test(message) && details[0]?.message) {
    message = `${message}: ${details[0].message}`;
  }
  const exitCode = exitCodeForStatus(status, code === "ENTITY_NOT_FOUND" || details.some((d) => d.code === "ENTITY_NOT_FOUND") ? "ENTITY_NOT_FOUND" : code);
  let hint = hintFor(status, code, [message, ...details.map((d) => d.message ?? "")].join(" | "));
  if (code === "NON_JSON_RESPONSE" && !hint) {
    hint = "Apple returns HTML (often a 503) for an unknown path; check the path, or retry if the service is down";
  }
  const out: CliErrorInit = { exitCode, code, message, status };
  if (hint) out.hint = hint;
  if (requestId) out.requestId = requestId;
  if (details.length) out.details = details.map((d) => Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)) as ErrorDetail);
  return new CliError(out);
}

export function toCliError(e: unknown): CliError {
  if (e instanceof CliError) return e;
  const err = e as { name?: string; message?: string; code?: string };
  if (err?.name === "TimeoutError" || err?.name === "AbortError") {
    return new CliError({ exitCode: ExitCode.RATE_LIMIT, code: "TIMEOUT", message: "The request timed out", hint: "raise --timeout, or narrow the query" });
  }
  return new CliError({ exitCode: ExitCode.API, code: err?.code ?? "ERROR", message: err?.message ?? String(e) });
}
