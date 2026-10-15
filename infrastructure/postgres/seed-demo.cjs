const { Client } = require("pg");
const { createHash, randomUUID } = require("node:crypto");
const argon2 = require("argon2");

function rng32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ["Aarav", "Ananya", "Arjun", "Diya", "Ishaan", "Kavya", "Krishna", "Lakshmi", "Manoj", "Neha", "Nikhil", "Pooja", "Priya", "Rahul", "Riya", "Rohan", "Sanya", "Shreya", "Varun", "Vikram", "Zara", "Aditi", "Farhan", "Gauri"];
const LAST = ["Sharma", "Iyer", "Menon", "Nair", "Gupta", "Reddy", "Khan", "Das", "Kulkarni", "Joshi", "Pillai", "Chopra"];
const DEPTS = ["Engineering", "Engineering", "Engineering", "HR", "Finance", "Design", "Sales", "Engineering"];
const DESIG = ["Engineer", "Senior Engineer", "Analyst", "HR Executive", "Designer", "Sales Executive", "Team Lead"];

function bucket(uuid) {
  const d = createHash("sha256").update(uuid.toLowerCase(), "utf8").digest();
  return d.readUInt32BE(0) % 256;
}

function uuidN(n) {
  return `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function pastWorkdays(count) {
  const days = [];
  const d = new Date("2026-10-09T00:00:00Z");
  while (days.length < count) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) days.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return days.reverse();
}

async function main() {
  const rand = rng32(42);
  const catalog = new Client({ connectionString: process.env.CATALOG_DATABASE_URL });
  await catalog.connect();
  const mapRows = await catalog.query("SELECT bucket_id, shard_id FROM routing_map_buckets WHERE version = (SELECT version FROM routing_map_versions WHERE domain = 'employee' AND active = TRUE)");
  const emap = new Map(mapRows.rows.map((r) => [r.bucket_id, r.shard_id]));
  const cmapRows = await catalog.query("SELECT bucket_id, shard_id FROM routing_map_buckets WHERE version = (SELECT version FROM routing_map_versions WHERE domain = 'candidate' AND active = TRUE)");
  const cmap = new Map(cmapRows.rows.map((r) => [r.bucket_id, r.shard_id]));

  for (const d of ["Sales", "Marketing"]) {
    await catalog.query("INSERT INTO departments (name) VALUES ($1) ON CONFLICT DO NOTHING", [d]);
  }
  await catalog.query("INSERT INTO review_cycles (cycle_id, name, start_date, end_date, status, created_by) VALUES ('CYC-H2-2026','H2 2026','2026-07-01','2026-12-31','ACTIVE','seed') ON CONFLICT (cycle_id) DO NOTHING");

  const pools = {};
  for (const [k, url] of Object.entries({
    "shard-1": process.env.DATABASE_SHARD_1_URL,
    "shard-2": process.env.DATABASE_SHARD_2_URL,
    "shard-3": process.env.DATABASE_SHARD_3_URL,
    "shard-4": process.env.DATABASE_SHARD_4_URL,
  })) {
    const c = new Client({ connectionString: url });
    await c.connect();
    pools[k] = c;
  }

  const people = [];
  for (let i = 0; i < 60; i++) {
    const id = uuidN(100 + i);
    const name = `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;
    const email = `${FIRST[i % FIRST.length].toLowerCase()}.demo${i}@hrms.local`;
    const dept = DEPTS[i % DEPTS.length];
    const desig = DESIG[i % DESIG.length];
    const b = bucket(id);
    const shard = emap.get(b);
    people.push({ id, name, email, dept, desig, b, shard, i });
    await pools[shard].query(
      "INSERT INTO employees (employee_id, bucket_id, display_id, email, name, department, designation, status) VALUES ($1,$2,$3,$4,$5,$6,$7,'ACTIVE') ON CONFLICT (employee_id) DO UPDATE SET name = EXCLUDED.name, department = EXCLUDED.department, designation = EXCLUDED.designation",
      [id, b, `EMP-${String(100 + i)}`, email, name, dept, desig]
    );
    await catalog.query(
      "INSERT INTO employee_directory (employee_id, email, email_norm, name, department, designation, status) VALUES ($1,$2,$3,$4,$5,$6,'ACTIVE') ON CONFLICT (employee_id) DO UPDATE SET name = EXCLUDED.name, department = EXCLUDED.department",
      [id, email, email.toLowerCase(), name, dept, desig]
    );
    await pools[shard].query(
      "INSERT INTO salary_structures (employee_id, bucket_id, basic_paise, allowances_paise, other_deductions_paise, pf_pct, tax_pct) VALUES ($1,$2,$3,$4,0,12,10) ON CONFLICT (employee_id) DO NOTHING",
      [id, b, 4000000 + Math.floor(rand() * 4000000), 1000000 + Math.floor(rand() * 2000000)]
    );
  }

  const managers = [people[2], people[9], people[15], people[21]];
  for (const m of managers) {
    const pw = await argon2.hash("ManagerPass1!", { type: argon2.argon2id });
    await catalog.query("INSERT INTO users (user_id, email, email_norm, password_hash, status) VALUES ($1,$2,$3,$4,'ACTIVE') ON CONFLICT (email_norm) DO NOTHING", [m.id, m.email, m.email.toLowerCase(), pw]);
    await catalog.query("INSERT INTO user_roles (user_id, role) VALUES ($1,'MANAGER') ON CONFLICT DO NOTHING", [m.id]);
  }
  for (const p of people) {
    if (managers.includes(p)) continue;
    const m = managers[p.i % managers.length];
    await pools[p.shard].query("UPDATE employees SET manager_id = $2 WHERE employee_id = $1", [p.id, m.id]);
  }

  const days = pastWorkdays(14);
  for (const p of people) {
    for (const day of days) {
      const r = rand();
      if (r < 0.06) continue;
      const late = r > 0.9;
      const cin = late ? `0${9}:3${Math.floor(rand() * 10)}` : `09:0${Math.floor(rand() * 9)}`;
      const hh = cin.replace(":", "");
      await pools[p.shard].query(
        "INSERT INTO attendance (attendance_id, employee_id, bucket_id, workday, check_in, check_out, status) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING",
        [`att-${p.i}-${day}`, p.id, p.b, day, `2026-${day.slice(5)}T${cin.slice(0, 2)}:${cin.slice(3)}:00+05:30`, `2026-${day.slice(5)}T18:0${Math.floor(rand() * 9)}:00+05:30`, late ? "LATE" : "PRESENT"]
      );
      void hh;
    }
    await pools[p.shard].query(
      "INSERT INTO leave_balances (employee_id, bucket_id, leave_type, year, total_days, used_days) VALUES ($1,$2,'CASUAL',2026,12,3),($1,$2,'SICK',2026,12,0),($1,$2,'EARNED',2026,24,0) ON CONFLICT DO NOTHING",
      [p.id, p.b]
    );
    if (p.i % 3 === 0) {
      await pools[p.shard].query(
        "INSERT INTO leave_requests (request_id, employee_id, bucket_id, leave_type, start_date, end_date, workdays, reason, status, version) VALUES ($1,$2,$3,'CASUAL','2026-09-14','2026-09-16',3,'Family event','APPROVED',2) ON CONFLICT DO NOTHING",
        [`lr-demo-${p.i}`, p.id, p.b]
      );
    }
    if (p.i % 4 === 1) {
      await pools[p.shard].query(
        "INSERT INTO leave_requests (request_id, employee_id, bucket_id, leave_type, start_date, end_date, workdays, reason, status, version) VALUES ($1,$2,$3,'CASUAL','2026-10-19','2026-10-20',2,'Upcoming trip','PENDING_MANAGER',1) ON CONFLICT DO NOTHING",
        [`lr-pend-${p.i}`, p.id, p.b]
      );
    }
    if (p.i % 2 === 0) {
      await pools[p.shard].query(
        "INSERT INTO goals (goal_id, employee_id, bucket_id, cycle_id, title, target, progress, status) VALUES ($1,$2,$3,'CYC-H2-2026',$4,'Ship on schedule',$5,'ACTIVE') ON CONFLICT DO NOTHING",
        [`goal-demo-${p.i}`, p.id, p.b, `Improve ${p.dept} throughput`, 20 + Math.floor(rand() * 70)]
      );
    }
    if (p.i % 4 === 0) {
      await pools[p.shard].query(
        "INSERT INTO reviews (review_id, employee_id, bucket_id, cycle_id, reviewer_id, rating, feedback, strengths, status, submitted_at) VALUES ($1,$2,$3,'CYC-H2-2026',$4,$5,'Consistent delivery','Ownership','RELEASED',now()) ON CONFLICT DO NOTHING",
        [`rev-demo-${p.i}`, p.id, p.b, managers[p.i % managers.length].id, 3 + Math.floor(rand() * 3)]
      );
    }
  }

  const jobs = [
    ["Backend Engineer", "Engineering", "Chennai", "Node.js, Postgres, Redis"],
    ["Product Designer", "Design", "Bengaluru", "Figma, Prototyping"],
    ["Sales Executive", "Sales", "Chennai", "Negotiation, CRM"],
  ];
  const jobIds = [];
  for (let j = 0; j < jobs.length; j++) {
    const jobId = `job-demo-${j}`;
    jobIds.push(jobId);
    await catalog.query(
      "INSERT INTO jobs (job_id, slug, title, department, description, required_skills, location, employment_type, status, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,'FULL_TIME','OPEN','seed') ON CONFLICT (job_id) DO NOTHING",
      [jobId, `demo-role-${j}`, jobs[j][0], jobs[j][1], `${jobs[j][0]} owning core outcomes for a growing team.`, jobs[j][3].split(", "), jobs[j][2]]
    );
  }
  const stages = ["APPLIED", "SCREENING", "SHORTLISTED", "ASSESSMENT", "INTERVIEW", "SELECTED", "REJECTED", "APPLIED"];
  const CNAMES = ["Karthik Raja", "Sneha Rao", "Deepak Verma", "Pavithra S", "Arun Kumar", "Nandini G", "Suresh P", "Kavitha R"];
  for (let k = 0; k < CNAMES.length; k++) {
    const cid = `cand-demo-${k}`;
    const cb = bucket(cid);
    const cshard = cmap.get(cb);
    const email = CNAMES[k].toLowerCase().replace(/[^a-z]+/g, ".") + "@example.com";
    await catalog.query("INSERT INTO candidate_email_claims (email_norm, candidate_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [email, cid]);
    await pools[cshard].query(
      "INSERT INTO candidates (candidate_id, candidate_bucket_id, name, email, phone, skills, experience_years, source) VALUES ($1,$2,$3,$4,'9800000000',ARRAY['node.js','postgres'],$5,'direct') ON CONFLICT (candidate_id) DO NOTHING",
      [cid, cb, CNAMES[k], email, 2 + (k % 5)]
    );
    const appId = `app-demo-${k}`;
    await pools[cshard].query("INSERT INTO applications (application_id, candidate_id, candidate_bucket_id, job_id, stage, version) VALUES ($1,$2,$3,$4,$5,2) ON CONFLICT DO NOTHING", [appId, cid, cb, jobIds[k % jobIds.length], stages[k]]);
    await catalog.query("INSERT INTO application_index (application_id, candidate_id, job_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [appId, cid, jobIds[k % jobIds.length]]);
  }

  for (const c of Object.values(pools)) await c.end();
  await catalog.end();
  console.log("seed-demo-complete: 60 people, attendance, leave, goals, reviews, jobs, applications");
}
main().catch((e) => { console.error(e); process.exit(1); });
