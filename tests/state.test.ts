import { beforeEach, describe, expect, it } from "vitest";
import { adopt, getConn, resetAll, view } from "@/server/connect/service";
import { open, seal } from "@/server/connect/state";
import type { Connection } from "@/server/connect/types";

const conn = (over: Partial<Connection> = {}): Connection => ({
  id: "abc123", input: "https://shop.test", url: "https://shop.test/", origin: "https://shop.test", host: "shop.test", controlled: false, ecommerce: false, site: {}, token: "acv_x", createdAt: "",
  ownership: { verified: true, method: "meta tag", attempts: [] }, authorized: true, grantedScopes: ["catalog:read"], candidates: [], signals: [], discoveryMethods: [], trace: [], flagsSeen: 0, cache: new Map(), accessToken: "cat_secret", checkouts: {}, orders: {}, audit: [], chat: [], evidence: [], ...over,
});

describe("connection state survives across server instances", () => {
  beforeEach(() => resetAll());

  it("a sealed connection reopens on an instance that has never seen it (the 'Unknown connection id' failure)", () => {
    const blob = seal(conn());
    resetAll(); // a different serverless instance: empty memory
    expect(() => getConn("abc123")).toThrow("Unknown connection id");
    adopt(blob);
    const c = getConn("abc123");
    expect(c.ownership.verified).toBe(true);
    expect(c.grantedScopes).toEqual(["catalog:read"]);
  });

  it("the browser cannot read or forge it: tampered, truncated and foreign blobs are refused", () => {
    const blob = seal(conn());
    expect(blob).not.toContain("cat_secret");
    const bad = blob.slice(0, -4) + (blob.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(open(bad)).toBeNull();
    expect(open(blob.slice(0, 30))).toBeNull();
    expect(open("not-a-state")).toBeNull();
    resetAll();
    adopt(bad);
    expect(() => getConn("abc123")).toThrow();
  });

  it("an attacker cannot grant themselves trust by editing client-held data: only server-sealed state is accepted", () => {
    const unverified = seal(conn({ ownership: { verified: false, attempts: [] }, authorized: false, grantedScopes: [] }));
    resetAll();
    adopt(unverified);
    expect(getConn("abc123").ownership.verified).toBe(false);
    expect(getConn("abc123").authorized).toBe(false);
  });

  it("the newest state wins; a stale copy never overwrites newer state on the same instance", () => {
    const c = conn({ ownership: { verified: false, attempts: [] }, authorized: false });
    const stale = seal(c); // rev 1
    resetAll();
    adopt(stale);
    const mem = getConn("abc123");
    mem.ownership = { verified: true, method: "meta tag", attempts: [] };
    view(mem); view(mem); // later revisions are sealed
    adopt(stale);
    expect(getConn("abc123").ownership.verified).toBe(true);
  });

  it("view() carries the sealed state so the browser can hand it back", () => {
    const v = view(conn());
    expect(typeof v.state).toBe("string");
    expect(open(v.state)?.id).toBe("abc123");
  });
});
