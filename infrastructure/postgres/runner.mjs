import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const migDir = join(here, "migrations");

const shardUrls = [
  process.env.DATABASE_SHARD_1_URL,
  process.env.DATABASE_SHARD_2_URL,
  process.env.DATABASE_SHARD_3_URL,
  process.env.DATABASE_SHARD_4_URL,
].filter(Boolean);
const catalogUrl = process.env.CATALOG_DATABASE_URL;

if (!catalogUrl || shardUrls.length !== 4) {
  console.error("Set CATALOG_DATABASE_URL and DATABASE_SHARD_1..4_URL before migrating.");
  process.exit(1);
}

async function apply(url, files, label) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    for (const f of files) {
      const sql = readFileSync(join(migDir, f), "utf8");
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING", [f]);
      await client.query("COMMIT");
      console.log(`${label}: applied ${f}`);
    }
    const { rows } = await client.query("SELECT version FROM schema_migrations ORDER BY version");
    console.log(`${label}: versions = ${rows.map((r) => r.version).join(",")}`);
  } finally {
    await client.end();
  }
}

const all = readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();
const shardFiles = all.filter((f) => f.includes("shard"));
const catalogFiles = all.filter((f) => f.includes("catalog"));

await apply(catalogUrl, catalogFiles, "pg-catalog");
for (let i = 0; i < shardUrls.length; i++) {
  await apply(shardUrls[i], shardFiles, `shard-${i + 1}`);
}
console.log("migrations-complete");
