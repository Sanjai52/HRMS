# Shard-Owned Tables Manifest (v1)

Canonical manifest for migration completeness and CI validation.
Every employee-owned table has `employee_id` + `bucket_id NOT NULL` + index.
Candidate tables are declared separately and are NOT part of the employee migration set.

## Employee domain (routing map: employee active version, shards 1-3 + standby 4 on add)

| table | domain | owner key | bucket col | copy order | checksum cols | excluded |
|---|---|---|---|---|---|---|
| employees | employee | employee_id | bucket_id | 1 | employee_id,bucket_id,email,name,status | no |
| outbox_events | employee | employee_id | bucket_id | — | — | yes (drained before copy, never copied) |
| attendance | employee | employee_id | bucket_id | 2 | employee_id,bucket_id,workday,status | no |
| leave_balances | employee | employee_id | bucket_id | 3 | employee_id,leave_type,year,used_days | no |
| leave_requests | employee | employee_id | bucket_id | 4 | request_id,employee_id,status,version | no |
| notifications | employee | employee_id | bucket_id | 5 | notification_id,employee_id,read_at | no |
| salary_structures | employee | employee_id | bucket_id | 6 | employee_id,basic_paise,allowances_paise | no |
| payroll_records | employee | employee_id | bucket_id | 7 | record_id,employee_id,period,net_paise | no |

Future Phase 3+ tables (attendance, leave, payroll, performance, notifications, outbox_events) will be appended here with copy order parent-before-child. `outbox_events` when added is drained-before-copy and excluded from bucket copy. Catalog projections are derived and excluded.

## Candidate domain (routing map: candidate-v1, pinned shards 1-3 in v1)

| table | domain | owner key | bucket col | notes |
|---|---|---|---|---|
| (Phase 6) candidates | candidate | candidate_id | candidate_bucket_id | not in employee migration set |
| (Phase 6) applications | candidate | candidate_id | candidate_bucket_id | via owning candidate |

## Exclusions

- `shard_write_gate`, `schema_migrations`: infrastructure, never copied.
- Catalog projections, autocomplete indexes: rebuilt from shards, never copied.
- Object-storage objects: keys never encode shard identity, never copied.
