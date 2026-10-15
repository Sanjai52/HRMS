import { buildRing, ownerOfBucket, VIRTUAL_NODES } from "./ring.js";
import { BUCKET_COUNT } from "./bucket.js";

export interface BucketMove {
  bucket: number;
  from: string;
  to: string;
}

export function computeMap(members: string[], v: number = VIRTUAL_NODES): Map<number, string> {
  const ring = buildRing(members, v);
  const map = new Map<number, string>();
  for (let b = 0; b < BUCKET_COUNT; b++) map.set(b, ownerOfBucket(b, ring));
  return map;
}

export function diffMaps(oldMap: Map<number, string>, newMap: Map<number, string>): BucketMove[] {
  const moves: BucketMove[] = [];
  for (let b = 0; b < BUCKET_COUNT; b++) {
    const from = oldMap.get(b);
    const to = newMap.get(b);
    if (from && to && from !== to) moves.push({ bucket: b, from, to });
  }
  return moves;
}

export const MIGRATION_MANIFEST: Array<{ table: string; conflict: string; checksumCols: string[] }> = [
  { table: "employees", conflict: "(employee_id)", checksumCols: ["employee_id", "bucket_id", "display_id", "email", "name", "department", "designation", "status", "version", "manager_id"] },
  { table: "attendance", conflict: "(employee_id, workday)", checksumCols: ["attendance_id", "employee_id", "bucket_id", "workday", "check_in", "check_out", "status"] },
  { table: "leave_balances", conflict: "(employee_id, leave_type, year)", checksumCols: ["employee_id", "bucket_id", "leave_type", "year", "total_days", "used_days"] },
  { table: "leave_requests", conflict: "(request_id)", checksumCols: ["request_id", "employee_id", "bucket_id", "leave_type", "start_date", "end_date", "workdays", "reason", "status", "version", "decided_by"] },
  { table: "notifications", conflict: "(notification_id)", checksumCols: ["notification_id", "employee_id", "bucket_id", "kind", "title", "body"] },
  { table: "salary_structures", conflict: "(employee_id)", checksumCols: ["employee_id", "bucket_id", "basic_paise", "allowances_paise", "other_deductions_paise", "pf_pct", "tax_pct"] },
  { table: "payroll_records", conflict: "(record_id)", checksumCols: ["record_id", "employee_id", "bucket_id", "period", "gross_paise", "lop_paise", "pf_paise", "tax_paise", "other_paise", "net_paise", "scheduled_days", "paid_days", "snapshot"] },
  { table: "goals", conflict: "(goal_id)", checksumCols: ["goal_id", "employee_id", "bucket_id", "cycle_id", "title", "description", "target", "progress", "status"] },
  { table: "reviews", conflict: "(review_id)", checksumCols: ["review_id", "employee_id", "bucket_id", "cycle_id", "reviewer_id", "rating", "feedback", "strengths", "improvements", "status", "version"] },
];
