// CLI wrapper around src/server/auctions/seed-demo-auctions.ts. Run with:
//   npm run seed:auctions
// (after npm run seed:agent-mall — this seeds auctions on top of Cadence
// Cycles / Luna Apparel, so those must already exist.)
import "dotenv/config";
import { seedDemoAuctions } from "../src/server/auctions/seed-demo-auctions";
import { closePool } from "../src/server/db/pool";

async function main() {
  const auctions = await seedDemoAuctions();
  for (const a of auctions) {
    console.log(`${a.title} (${a.id}) — ${a.product_external_id}, starting $${a.starting_price}, buy now $${a.buy_now_price}`);
  }
  console.log("\nSeed complete.");
  await closePool();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
