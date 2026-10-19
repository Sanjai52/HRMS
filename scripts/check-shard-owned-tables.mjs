#!/usr/bin/env node
// CI check (NFR-MIG-03, PRD §34): a shard schema migration must not introduce an
// employee/candidate-owned table (one carrying bucket ownership) without declaring
// it in docs/shard-owned-tables.md — and every declared table must exist in some
// migration (guards the doc against drift too).
//
// Scope note: ownership is judged at table-creation time; an ALTER adding a bucket
// column to an existing infrastructure table is out of this check's scope.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "infrastructure/postgres/migrations");
const manifestPath = join(root, "docs/shard-owned-tables.md");

const manifest = new Set();
for (const line of readFileSync(manifestPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\|\s*([a-z_][a-z0-9_]*)\s*\|/);
  if (m && m[1] !== "table") manifest.add(m[1]);
}

const owned = new Map();
for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
  if (/catalog/i.test(file)) continue; // catalog-owned tables are not shard-owned by definition
  const sql = readFileSync(join(migrationsDir, file), "utf8");
  const re = /CREATE TABLE(?: IF NOT EXISTS)?\s+([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)^\)\s*;/gm;
  let m;
  while ((m = re.exec(sql))) {
    if (/bucket_id/.test(m[2]) && !owned.has(m[1])) owned.set(m[1], file);
  }
}

const undeclared = [...owned.entries()].filter(([table]) => !manifest.has(table));
const missing = [...manifest].filter((table) => !owned.has(table));

if (undeclared.length > 0 || missing.length > 0) {
  if (undeclared.length > 0) {
    console.error("Owned tables created by shard migrations but NOT declared in docs/shard-owned-tables.md:");
    for (const [table, file] of undeclared) console.error(`  - ${table} (${file})`);
  }
  if (missing.length > 0) {
    console.error("Tables declared in docs/shard-owned-tables.md but not found in any shard migration:");
    for (const table of missing) console.error(`  - ${table}`);
  }
  process.exit(1);
}

console.log(`shard-owned-tables-ok (owned: ${owned.size}, declared: ${manifest.size})`);
