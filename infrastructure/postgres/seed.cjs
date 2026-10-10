const { Client } = require("pg");
const { createHash, randomUUID } = require("node:crypto");
const argon2 = require("argon2");

const SHARDS = {
  "shard-1": process.env.DATABASE_SHARD_1_URL,
  "shard-2": process.env.DATABASE_SHARD_2_URL,
  "shard-3": process.env.DATABASE_SHARD_3_URL,
  "shard-4": process.env.DATABASE_SHARD_4_URL,
};

function bucket(uuid) {
  const d = createHash("sha256").update(uuid.toLowerCase(), "utf8").digest();
  return d.readUInt32BE(0) % 256;
}

async function main() {
  const catalog = new Client({ connectionString: process.env.CATALOG_DATABASE_URL });
  await catalog.connect();

  for (const d of ["Engineering", "HR", "Finance"]) {
    await catalog.query("INSERT INTO departments (name) VALUES ($1) ON CONFLICT DO NOTHING", [d]);
  }
  for (const d of ["Engineer", "HR Manager", "Analyst"]) {
    await catalog.query("INSERT INTO designations (name) VALUES ($1) ON CONFLICT DO NOTHING", [d]);
  }

  const mapRows = await catalog.query("SELECT bucket_id, shard_id FROM routing_map_buckets WHERE version = 1");
  const map = new Map(mapRows.rows.map((r) => [r.bucket_id, r.shard_id]));

  const hrEmail = "hr@hrms.local";
  const hrId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const pwHash = await argon2.hash("ChangeMe123!", { type: argon2.argon2id });
  await catalog.query(
    "INSERT INTO users (user_id, email, email_norm, password_hash, status) VALUES ($1, $2, $3, $4, 'ACTIVE') ON CONFLICT (email_norm) DO UPDATE SET password_hash = EXCLUDED.password_hash",
    [hrId, hrEmail, hrEmail.toLowerCase(), pwHash]
  );
  await catalog.query("INSERT INTO user_roles (user_id, role) VALUES ($1, 'HR') ON CONFLICT DO NOTHING", [hrId]);

  const people = [
    { id: "11111111-1111-1111-1111-111111111111", name: "Asha Rao", email: "asha.rao@hrms.local", dept: "Engineering", desig: "Engineer" },
    { id: "22222222-2222-2222-2222-222222222222", name: "Ben Kurian", email: "ben.kurian@hrms.local", dept: "HR", desig: "HR Manager" },
    { id: "123e4567-e89b-12d3-a456-426614174000", name: "Cara Iyer", email: "cara.iyer@hrms.local", dept: "Finance", desig: "Analyst" },
    { id: randomUUID(), name: "Dev Menon", email: "dev.menon@hrms.local", dept: "Engineering", desig: "Engineer" },
    { id: randomUUID(), name: "Esha Nair", email: "esha.nair@hrms.local", dept: "Engineering", desig: "Engineer" },
  ];

  const pools = {};
  for (const [k, url] of Object.entries(SHARDS)) {
    const c = new Client({ connectionString: url });
    await c.connect();
    pools[k] = c;
  }

  for (const [i, p] of people.entries()) {
    const b = bucket(p.id);
    const shard = map.get(b);
    if (!shard || shard === "shard-4") throw new Error(`unexpected owner ${shard} for bucket ${b}`);
    const display = `EMP-${String(i + 1).padStart(6, "0")}`;
    await pools[shard].query(
      "INSERT INTO employees (employee_id, bucket_id, display_id, email, name, department, designation, status) VALUES ($1,$2,$3,$4,$5,$6,$7,'ACTIVE') ON CONFLICT (employee_id) DO UPDATE SET bucket_id=EXCLUDED.bucket_id, name=EXCLUDED.name",
      [p.id, b, display, p.email, p.name, p.dept, p.desig]
    );
    await catalog.query(
      "INSERT INTO employee_directory (employee_id, email, email_norm, name, department, designation, status) VALUES ($1,$2,$3,$4,$5,$6,'ACTIVE') ON CONFLICT (employee_id) DO UPDATE SET name=EXCLUDED.name, department=EXCLUDED.department",
      [p.id, p.email, p.email.toLowerCase(), p.name, p.dept, p.desig]
    );
    console.log(`${p.name} bucket=${b} shard=${shard}`);
  }

  // HR user is also an employee on its shard for directory completeness
  const hrBucket = bucket(hrId);
  const hrShard = map.get(hrBucket);
  await pools[hrShard].query(
    "INSERT INTO employees (employee_id, bucket_id, display_id, email, name, department, designation, status) VALUES ($1,$2,'EMP-000000',$3,'HR Admin','HR','HR Manager','ACTIVE') ON CONFLICT (employee_id) DO NOTHING",
    [hrId, hrBucket, hrEmail]
  );
  await catalog.query(
    "INSERT INTO employee_directory (employee_id, email, email_norm, name, department, designation, status) VALUES ($1,$2,$3,'HR Admin','HR','HR Manager','ACTIVE') ON CONFLICT (employee_id) DO NOTHING",
    [hrId, hrEmail, hrEmail.toLowerCase()]
  );
  console.log(`HR bucket=${hrBucket} shard=${hrShard}`);

  for (const c of Object.values(pools)) await c.end();
  await catalog.end();
  console.log("seed-complete");
}
main().catch((e) => { console.error(e); process.exit(1); });
