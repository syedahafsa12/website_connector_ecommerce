import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const client = new Client({ connectionString });
  await client.connect();
  await client.query(`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`);

  const dir = path.join(process.cwd(), "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    const { rows } = await client.query(`select 1 from schema_migrations where name = $1`, [file]);
    if (rows.length > 0) {
      console.log(`skip (already applied): ${file}`);
      continue;
    }
    const sql = readFileSync(path.join(dir, file), "utf8");
    console.log(`applying: ${file}`);
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query(`insert into schema_migrations (name) values ($1)`, [file]);
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    }
  }

  await client.end();
  console.log("done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
