// CLI wrapper around src/server/merchants/seed-agent-mall.ts — see that
// module for what gets seeded and why. Run with:
//   npm run seed:agent-mall
import "dotenv/config";
import { seedAgentMallMerchants } from "../src/server/merchants/seed-agent-mall";
import { closePool } from "../src/server/db/pool";

async function main() {
  const merchants = await seedAgentMallMerchants();
  for (const m of merchants) {
    console.log(`${m.slug} (${m.id}) — status: ${m.status}`);
  }
  console.log("\nSeed complete.");
  await closePool();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
