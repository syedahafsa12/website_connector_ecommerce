import "dotenv/config";
import { getMerchantBySlug, createMerchant } from "../src/server/merchants/repository";
import { NORTHSTAR_SLUG, VERTEX_SLUG, URBAN_SLUG, ROGUE_SLUG } from "../src/demo-merchants/catalog";
import { closePool } from "../src/server/db/pool";

const APP_BASE_URL = process.env.APP_BASE_URL ?? "http://localhost:3000";

const MERCHANTS = [
  {
    name: "Northstar Running",
    slug: NORTHSTAR_SLUG,
    domain: "northstar-demo.example",
    category: "Running shoes / apparel",
    connectorType: "rest" as const,
    connectorConfig: { baseUrl: `${APP_BASE_URL}/api/demo/merchant-a` },
  },
  {
    name: "Vertex Athletics",
    slug: VERTEX_SLUG,
    domain: "vertex-athletics-demo.example",
    category: "Running shoes / apparel",
    connectorType: "mcp" as const,
    connectorConfig: {
      command: process.env.MERCHANT_B_MCP_COMMAND ?? "npx",
      args: (process.env.MERCHANT_B_MCP_ARGS ?? "tsx,scripts/mcp-servers/merchant-b-server.ts").split(","),
    },
  },
  {
    name: "Urban Services",
    slug: URBAN_SLUG,
    domain: "urban-services-demo.example",
    category: "Running-shoe fitting & repair service",
    connectorType: "web" as const,
    connectorConfig: {
      baseUrl: APP_BASE_URL,
      pagePaths: ["/demo/merchant-c/services/us-001", "/demo/merchant-c/services/us-002"],
    },
  },
  {
    name: "Rogue Gear Co",
    slug: ROGUE_SLUG,
    domain: "rogue-gear-demo.example",
    category: "Running shoes (adversarial content demo)",
    connectorType: "rest" as const,
    connectorConfig: { baseUrl: `${APP_BASE_URL}/api/demo/merchant-d` },
    isAdversarialDemo: true,
  },
  {
    // Real standalone site (not hosted by this app): D:\clothing_website,
    // its own tiny Node server (see server.js). /api/agent/products(...)
    // is a thin adapter matching RestMerchantConnector's exact wire contract
    // (title/category:"product"/color/quantity/shipping/returns/warranty);
    // the richer /api/products (name, colors[], sizes, material, tags) is
    // what the storefront and admin.html use directly. Run that server
    // separately (default port 4173) and point LUNA_APPAREL_BASE_URL at it
    // before seeding if it's not local.
    name: "Luna Apparel",
    slug: "luna-apparel",
    domain: "luna-apparel-demo.example",
    category: "Premium minimalist fashion (DTC)",
    connectorType: "rest" as const,
    connectorConfig: { baseUrl: process.env.LUNA_APPAREL_BASE_URL ?? "http://localhost:4173/api/agent" },
  },
];

async function main() {
  for (const m of MERCHANTS) {
    const existing = await getMerchantBySlug(m.slug);
    if (existing) {
      console.log(`skip (exists): ${m.slug}`);
      continue;
    }
    const merchant = await createMerchant(m);
    console.log(`created: ${merchant.slug} (${merchant.id}) — status: ${merchant.status}`);
  }
  console.log("\nSeed complete. Merchants are in 'pending_verification' — connect each through the console UI:");
  console.log("  1. Start domain verification (well-known file)");
  console.log("  2. Check verification");
  console.log("  3. Authorize scopes (Products, Inventory, Shipping, Returns, Warranty)");
  await closePool();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
