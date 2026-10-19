import { computePay, monthRange, overlapWorkdays } from "./payroll.js";
import { countWorkdays } from "./leave-rules.js";
import { ACTIVE_SHARDS, type Queryable } from "./shard-router.js";

export interface ChunkDb {
  catalog: Queryable;
  shard: Queryable;
}

export async function runPayrollChunk(
  db: ChunkDb,
  batchId: string,
  period: string,
  shard: string
): Promise<{ processed: number; failed: number; skipped: number }> {
  const { start, end } = monthRange(period);
  const h = await db.catalog.query("SELECT holiday_date FROM holidays");
  const holidays = new Set(h.rows.map((r) => (r.holiday_date as unknown as Date).toISOString().slice(0, 10)));
  const scheduled = countWorkdays(start, end, holidays);
  const people = await db.shard.query("SELECT employee_id, bucket_id FROM employees WHERE status = 'ACTIVE' LIMIT 500");
  await db.catalog.query("UPDATE payroll_batches SET status = 'RUNNING' WHERE batch_id = $1 AND status = 'PENDING'", [batchId]);
  const ids = people.rows.map((r) => r.employee_id as string);

  type StructureRow = { employee_id: string; basic_paise: number; allowances_paise: number; other_deductions_paise: number; pf_pct: string; tax_pct: string };
  const structures = new Map<string, StructureRow>();
  const attendance = new Map<string, number>();
  const leavesByEmployee = new Map<string, Array<{ start_date: Date; end_date: Date }>>();
  if (ids.length > 0) {
    const s = await db.shard.query(
      "SELECT employee_id, basic_paise, allowances_paise, other_deductions_paise, pf_pct, tax_pct FROM salary_structures WHERE employee_id = ANY($1::uuid[])",
      [ids]
    );
    for (const row of s.rows as unknown as StructureRow[]) structures.set(row.employee_id, row);
    const att = await db.shard.query(
      "SELECT employee_id, COUNT(*) AS c FROM attendance WHERE employee_id = ANY($1::uuid[]) AND workday >= $2::date AND workday <= $3::date AND status IN ('PRESENT','LATE') GROUP BY employee_id",
      [ids, start, end]
    );
    for (const row of att.rows as unknown as Array<{ employee_id: string; c: string }>) attendance.set(row.employee_id, Number(row.c));
    const lv = await db.shard.query(
      "SELECT employee_id, start_date, end_date FROM leave_requests WHERE employee_id = ANY($1::uuid[]) AND status = 'APPROVED' AND start_date <= $3 AND end_date >= $2",
      [ids, start, end]
    );
    for (const row of lv.rows as unknown as Array<{ employee_id: string; start_date: Date; end_date: Date }>) {
      const list = leavesByEmployee.get(row.employee_id) ?? [];
      list.push({ start_date: row.start_date, end_date: row.end_date });
      leavesByEmployee.set(row.employee_id, list);
    }
  }

  let processed = 0;
  let failed = 0;
  let skipped = 0;
  for (const person of people.rows as Array<{ employee_id: string; bucket_id: number }>) {
    try {
      const st = structures.get(person.employee_id);
      if (!st) {
        skipped += 1;
        continue;
      }
      const present = attendance.get(person.employee_id) ?? 0;
      let paidLeave = 0;
      for (const l of leavesByEmployee.get(person.employee_id) ?? []) {
        paidLeave += overlapWorkdays(l.start_date.toISOString().slice(0, 10), l.end_date.toISOString().slice(0, 10), start, end, holidays);
      }
      const paid = Math.min(scheduled, present + paidLeave);
      const breakdown = computePay({
        basicPaise: st.basic_paise,
        allowancesPaise: st.allowances_paise,
        otherDeductionsPaise: st.other_deductions_paise,
        pfPct: Number(st.pf_pct),
        taxPct: Number(st.tax_pct),
        scheduledDays: scheduled,
        unpaidDays: scheduled - paid,
      });
      const recordId = `${batchId}:${person.employee_id}`;
      await db.shard.query(
        `INSERT INTO payroll_records (record_id, employee_id, bucket_id, period, gross_paise, lop_paise, pf_paise, tax_paise, other_paise, net_paise, scheduled_days, paid_days, snapshot)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT DO NOTHING`,
        [recordId, person.employee_id, person.bucket_id, period, breakdown.grossPaise, breakdown.lopPaise, breakdown.pfPaise, breakdown.taxPaise, breakdown.otherPaise, breakdown.netPaise, scheduled, paid,
          JSON.stringify({ batchId, shard, basic: st.basic_paise, allowances: st.allowances_paise })]
      );
      await db.shard.query(
        `INSERT INTO notifications (notification_id, employee_id, bucket_id, kind, title, body) VALUES ($1,$2,$3,'payroll','Payslip ready',$4) ON CONFLICT DO NOTHING`,
        [`${recordId}:ready`, person.employee_id, person.bucket_id, `Your payslip for ${period} is ready.`]
      );
      processed += 1;
    } catch {
      failed += 1;
    }
  }
  // Per-shard bookkeeping is idempotent: a retried chunk (worker kill, BullMQ
  // stall redelivery) rewrites its own row instead of inflating the batch totals.
  await db.catalog.query(
    `INSERT INTO payroll_batch_shards (batch_id, shard, total, done, failed, skipped, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (batch_id, shard) DO UPDATE SET
       total = EXCLUDED.total, done = EXCLUDED.done, failed = EXCLUDED.failed, skipped = EXCLUDED.skipped, updated_at = EXCLUDED.updated_at`,
    [batchId, shard, people.rows.length, processed, failed, skipped]
  );
  const agg = await db.catalog.query(
    `SELECT COUNT(*)::int AS shards,
            COALESCE(SUM(total), 0)::int AS total,
            COALESCE(SUM(done), 0)::int AS done,
            COALESCE(SUM(failed), 0)::int AS failed,
            COALESCE(SUM(skipped), 0)::int AS skipped
       FROM payroll_batch_shards WHERE batch_id = $1`,
    [batchId]
  );
  const s = agg.rows[0] as unknown as { shards: number; total: number; done: number; failed: number; skipped: number };
  const finished = s.shards >= ACTIVE_SHARDS.length && s.total > 0 && s.done + s.failed + s.skipped >= s.total;
  await db.catalog.query(
    `UPDATE payroll_batches
        SET total = $2, done = $3, failed = $4, skipped = $5,
            status = CASE WHEN $6 THEN (CASE WHEN $4 > 0 THEN 'PARTIAL_FAILED' ELSE 'COMPLETED' END) ELSE status END
      WHERE batch_id = $1`,
    [batchId, s.total, s.done, s.failed, s.skipped, finished]
  );
  return { processed, failed, skipped };
}
