import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import net from "node:net";
import zlib from "node:zlib";
import { randomBytes } from "node:crypto";

/**
 * The ONLY place the connection prototype makes outbound HTTP requests.
 * Guarantees: http/https only, no embedded credentials, no non-standard ports
 * (external sites), no private/loopback/link-local addresses (checked at
 * connect time against the resolved IP), no redirect following, hard timeout,
 * hard size cap, every request traced.
 */

export type FailCode =
  | "INVALID_URL" | "UNSUPPORTED_SCHEME" | "CREDENTIALS_IN_URL" | "NONSTANDARD_PORT" | "BLOCKED_ADDRESS"
  | "DNS_FAILED" | "CONNECTION_REFUSED" | "TIMEOUT" | "TLS_ERROR" | "NETWORK_ERROR" | "TOO_LARGE"
  | "REDIRECT_BLOCKED" | "HTTP_ERROR" | "UNSUPPORTED_DATA" | "OUT_OF_SCOPE";

export class SiteError extends Error {
  constructor(public code: FailCode, message: string, public extra: { location?: string; status?: number } = {}) {
    super(message);
  }
}

export type TraceEntry = {
  id: string;
  at: string;
  purpose: string;
  method: "GET" | "POST" | "DNS";
  url: string;
  status: number | string;
  ms: number;
  bytes: number;
  note?: string;
};

export type Fetched = { status: number; headers: http.IncomingHttpHeaders; body: string; truncated: boolean; trace: TraceEntry };

export const newId = (prefix: string) => `${prefix}_${randomBytes(4).toString("hex")}`;

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    const mapped = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]!);
    return l === "::1" || l === "::" || l.startsWith("fc") || l.startsWith("fd") || /^fe[89ab]/.test(l) || l.startsWith("ff");
  }
  const [a, b] = ip.split(".").map(Number) as [number, number];
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19))
  );
}

/** Parse + validate a user-entered URL. `allowLocal` is only ever true for the platform's own demo sites. */
export function parseSiteUrl(raw: string, allowLocal: boolean): URL {
  const input = raw.trim();
  if (!input || input.length > 2000) throw new SiteError("INVALID_URL", "Enter a website URL (max 2000 characters).");
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(input) && !/^[^/]+:\d+(\/|$)/.test(input) ? input : `https://${input}`;
  let u: URL;
  try { u = new URL(withScheme); } catch { throw new SiteError("INVALID_URL", `"${input.slice(0, 80)}" is not a valid URL.`); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new SiteError("UNSUPPORTED_SCHEME", `Scheme "${u.protocol}" is not supported — only http/https websites can be tested.`);
  if (u.username || u.password) throw new SiteError("CREDENTIALS_IN_URL", "URLs with embedded credentials are rejected. The platform never accepts or stores website credentials.");
  if (!allowLocal) {
    const host = u.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(host) && isPrivateIp(host)) throw new SiteError("BLOCKED_ADDRESS", `${host} is a private/loopback address — blocked to prevent server-side request forgery.`);
    if (host === "localhost" || host.endsWith(".localhost")) throw new SiteError("BLOCKED_ADDRESS", "localhost is a private address — blocked to prevent server-side request forgery.");
    if (u.port && u.port !== (u.protocol === "https:" ? "443" : "80")) throw new SiteError("NONSTANDARD_PORT", `Non-standard port ${u.port} is not allowed for external sites.`);
    if (!net.isIP(host) && !host.includes(".")) throw new SiteError("INVALID_URL", `"${host}" is not a public hostname.`);
  }
  u.hash = "";
  return u;
}

function classify(e: NodeJS.ErrnoException): SiteError {
  if (e instanceof SiteError) return e;
  const c = e.code ?? "";
  if (c === "ENOTFOUND" || c === "EAI_AGAIN") return new SiteError("DNS_FAILED", "Domain does not resolve (DNS lookup failed).");
  if (c === "ECONNRESET") return new SiteError("NETWORK_ERROR", "Connection reset by the server during the request (possible TLS failure or bot protection).");
  if (c === "ECONNREFUSED") return new SiteError("CONNECTION_REFUSED", "Connection refused by the server.");
  if (c === "ETIMEDOUT" || c === "ESOCKETTIMEDOUT" || c === "TIMEOUT") return new SiteError("TIMEOUT", "Connection timed out.");
  if (/CERT|SSL|TLS|ERR_TLS|DEPTH_ZERO|UNABLE_TO_VERIFY|SELF_SIGNED|HOSTNAME_MISMATCH/i.test(c + e.message)) return new SiteError("TLS_ERROR", `TLS/certificate error: ${e.message}`);
  return new SiteError("NETWORK_ERROR", `Network error: ${e.code ?? ""} ${e.message}`.trim());
}

export interface GetOpts {
  purpose: string;
  allowLocal?: boolean;
  accept?: string;
  maxBytes?: number;
  timeoutMs?: number;
  /** Non-GET requests are reserved for authorized commerce actions (trusted tier only); body is JSON. */
  method?: "GET" | "POST";
  body?: unknown;
  headers?: Record<string, string>;
  /** Called with every trace entry (success or failure). */
  onTrace: (t: TraceEntry) => void;
}

/** One safe GET. Throws SiteError on transport/policy failures; HTTP status codes (incl. 3xx/4xx/5xx) are returned for the caller to judge. */
export async function safeGet(url: string, o: GetOpts): Promise<Fetched> {
  const started = Date.now();
  const entry = (status: number | string, bytes: number, note?: string): TraceEntry => ({
    id: newId("req"), at: new Date().toISOString(), purpose: o.purpose, method: o.method ?? "GET", url, status, ms: Date.now() - started, bytes, note,
  });
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new SiteError("UNSUPPORTED_SCHEME", "Only http/https.");
    const host = u.hostname.replace(/^\[|\]$/g, "");
    if (!o.allowLocal && net.isIP(host) && isPrivateIp(host)) throw new SiteError("BLOCKED_ADDRESS", `${host} is a private address — blocked.`);
    const maxBytes = o.maxBytes ?? 1_500_000;
    const payload = o.method === "POST" ? Buffer.from(JSON.stringify(o.body ?? {})) : null;
    if (payload && payload.length > 20_000) throw new SiteError("TOO_LARGE", "Request body too large.");
    const lib = u.protocol === "https:" ? https : http;

    const result = await new Promise<Omit<Fetched, "trace">>((resolve, reject) => {
      const req = lib.request(
        u,
        {
          method: o.method ?? "GET",
          timeout: o.timeoutMs ?? 8000,
          headers: {
            ...(payload ? { "content-type": "application/json", "content-length": String(payload.length) } : {}),
            ...(o.headers ?? {}),
            accept: o.accept ?? "*/*",
            "accept-encoding": "gzip, deflate, br",
            "user-agent": "AgenticCommerceConnectionPrototype/0.2 (read-only diagnostics)",
          },
          // Pin the connection to a validated address: the check happens on the IP actually used.
          lookup: (hostname, options, cb) => {
            dns.lookup(hostname, { ...options, all: true }, (err, addrs) => {
              if (err) return (cb as any)(err);
              const list = addrs as dns.LookupAddress[];
              if (!o.allowLocal) {
                const bad = list.find((a) => isPrivateIp(a.address));
                if (bad) return (cb as any)(new SiteError("BLOCKED_ADDRESS", `${hostname} resolves to private address ${bad.address} — blocked to prevent server-side request forgery.`));
              }
              if ((options as any).all) return (cb as any)(null, list);
              (cb as any)(null, list[0]!.address, list[0]!.family);
            });
          },
        },
        (res) => {
          const status = res.statusCode ?? 0;
          if (status >= 300 && status < 400) {
            res.resume();
            return resolve({ status, headers: res.headers, body: "", truncated: false });
          }
          const enc = String(res.headers["content-encoding"] ?? "").toLowerCase();
          let stream: NodeJS.ReadableStream = res;
          if (enc === "gzip") stream = res.pipe(zlib.createGunzip());
          else if (enc === "deflate") stream = res.pipe(zlib.createInflate());
          else if (enc === "br") stream = res.pipe(zlib.createBrotliDecompress());
          const chunks: Buffer[] = [];
          let size = 0;
          let truncated = false;
          stream.on("data", (c: Buffer) => {
            size += c.length;
            if (size > maxBytes) { truncated = true; req.destroy(); return; }
            chunks.push(c);
          });
          stream.on("end", () => resolve({ status, headers: res.headers, body: Buffer.concat(chunks).toString("utf8"), truncated }));
          stream.on("error", (e) => (truncated ? resolve({ status, headers: res.headers, body: Buffer.concat(chunks).toString("utf8"), truncated }) : reject(e)));
          res.on("close", () => truncated && resolve({ status, headers: res.headers, body: Buffer.concat(chunks).toString("utf8"), truncated }));
        },
      );
      req.on("timeout", () => req.destroy(Object.assign(new Error("timeout"), { code: "TIMEOUT" })));
      req.on("error", reject);
      req.end(payload ?? undefined);
    });
    const t = entry(result.status, result.body.length, result.truncated ? "response truncated at size cap" : undefined);
    o.onTrace(t);
    return { ...result, trace: t };
  } catch (e) {
    const err = classify(e as NodeJS.ErrnoException);
    o.onTrace(entry(err.code, 0, err.message));
    throw err;
  }
}

/** Turn an HTTP response into a failure when it is not a usable 200. */
export function assertOk(f: Fetched, what: string) {
  if (f.status >= 300 && f.status < 400) {
    const loc = String(f.headers.location ?? "");
    let abs = loc;
    try { abs = new URL(loc, f.trace.url).toString(); } catch { /* keep raw */ }
    throw new SiteError("REDIRECT_BLOCKED", `Redirect blocked (HTTP ${f.status} → ${abs || "unknown"}). The platform never follows site-controlled redirects.`, { location: abs, status: f.status });
  }
  if (f.status === 401 || f.status === 403 || f.status === 429 || f.status === 503) {
    const server = String(f.headers.server ?? "");
    throw new SiteError("HTTP_ERROR", `${what} refused: HTTP ${f.status}${server ? ` (server: ${server})` : ""} — likely access control or bot protection. The platform does not attempt to bypass it.`, { status: f.status });
  }
  if (f.status < 200 || f.status >= 300) throw new SiteError("HTTP_ERROR", `${what} returned HTTP ${f.status}.`, { status: f.status });
}
