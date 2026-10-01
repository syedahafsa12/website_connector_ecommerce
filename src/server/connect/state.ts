import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { secret } from "./trust";
import type { Connection } from "./types";

/**
 * Connection state must survive across requests that may be served by different server instances (serverless).
 * After each step the server seals the connection (AES-256-GCM, key derived from the server secret) and the browser
 * hands it back on the next call. The browser cannot read or alter it: a tampered or foreign blob fails to open,
 * so ownership / authorization can only ever be what this server itself recorded.
 */
const key = () => createHash("sha256").update(`connection-state|${secret()}`).digest();

/** Large, rebuildable parts are trimmed; the cache is dropped and refilled on demand. */
function serialize(c: Connection): string {
  const { cache: _cache, ...rest } = c;
  return JSON.stringify({ ...rest, trace: rest.trace.slice(-30), audit: rest.audit.slice(-60), chat: rest.chat.slice(-20) });
}

export function seal(c: Connection): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(serialize(c), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64url");
}

export function open(blob: unknown): Connection | null {
  if (typeof blob !== "string" || blob.length < 40 || blob.length > 3_000_000) return null;
  try {
    const raw = Buffer.from(blob, "base64url");
    const d = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    const j = JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8")) as Connection;
    if (typeof j.id !== "string" || !j.ownership || !Array.isArray(j.candidates)) return null;
    return { ...j, cache: new Map() };
  } catch {
    return null; // wrong key, tampered, or not ours
  }
}
