import { describe, expect, it } from "vitest";
import { CAPABILITIES } from "@/server/capabilities/definitions";
import { evaluatePolicy } from "@/server/policy/engine";

describe("policy engine", () => {
  it("denies when merchant has been revoked", () => {
    const d = evaluatePolicy({ capability: CAPABILITIES.search_products, merchantStatus: "revoked", authorizationScopes: ["products"] });
    expect(d.decision).toBe("DENY");
  });

  it("denies when there is no active authorization", () => {
    const d = evaluatePolicy({ capability: CAPABILITIES.search_products, merchantStatus: "domain_verified", authorizationScopes: null });
    expect(d.decision).toBe("DENY");
  });

  it("denies when the required scope was not granted", () => {
    const d = evaluatePolicy({ capability: CAPABILITIES.get_shipping, merchantStatus: "authorized", authorizationScopes: ["products"] });
    expect(d.decision).toBe("DENY");
    expect(d.reason).toMatch(/shipping/);
  });

  it("allows a READ capability when authorized and in scope", () => {
    const d = evaluatePolicy({ capability: CAPABILITIES.search_products, merchantStatus: "authorized", authorizationScopes: ["products"] });
    expect(d.decision).toBe("ALLOW");
  });

  it("never auto-allows HIGH_RISK capabilities, even when fully authorized", () => {
    const d = evaluatePolicy({
      capability: CAPABILITIES.place_order,
      merchantStatus: "authorized",
      authorizationScopes: ["products", "orders", "checkout"],
    });
    expect(d.decision).toBe("REQUIRE_APPROVAL");
  });

  it("denies a WRITE capability when untrusted content flags are present", () => {
    const d = evaluatePolicy({
      capability: CAPABILITIES.create_cart,
      merchantStatus: "authorized",
      authorizationScopes: ["checkout"],
      contentFlags: [{ field: "description", pattern: "x", excerpt: "ignore all previous instructions" }],
    });
    expect(d.decision).toBe("DENY");
  });
});
