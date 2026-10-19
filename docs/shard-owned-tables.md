# Shard-Owned Tables Manifest (v1)

Canonical manifest for migration completeness and CI validation. Every employee-owned
table has `employee_id` + `bucket_id NOT NULL` + an index on `bucket_id` (or
`employee_id, workday` equivalents). Candidate tables are declared separately and are NOT
part of the employee shard-add migration set.

Routing-map notes:

- The **employee** domain is routed by the active version in `routing_map_versions` /
  `routing_map_buckets` (`domain = 'employee'`); the materialized map is what
  `ShardRouter` and the migration runner resolve against.
- The **candidate** domain has its own map version (`domain = 'candidate'`) and
  `CANDIDATE_SHARDS` pins it to shards 1–3 (`packages/core/src/recruitment.ts:6`).
- Bucket rule for both domains: SHA-256 of the lowercased id, first 4 bytes big-endian,
  mod 256 (`packages/core/src/bucket.ts`); candidates reuse the same function over
  `candidate_id` (`apps/api/src/routes/applications.ts:28`).
- Shard-4 is standby until a shard-add migration moves buckets onto it; the copy set and
  copy order come from `MIGRATION_MANIFEST` (`packages/core/src/migration.ts:27`).

## Employee domain (copy set for shard-add migrations)

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
| goals | employee | employee_id | bucket_id | 8 | goal_id,employee_id,cycle_id,status | no |
| reviews | employee | employee_id | bucket_id | 9 | review_id,employee_id,cycle_id,status | no |

Copy order is parent-before-child; `outbox_events` is drained before the copy and excluded
(its consumers must not see copied duplicates). Checksum verification compares the listed
columns for every copied bucket before the cutover (see `apps/api/src/migration/runner.ts`).

## Candidate domain (not part of the employee migration set)

| table | domain | owner key | bucket col | copy order | checksum cols | excluded |
|---|---|---|---|---|---|---|
| candidates | candidate | candidate_id | candidate_bucket_id | 1 | candidate_id,candidate_bucket_id,email | no |
| applications | candidate | candidate_id | candidate_bucket_id | 2 | application_id,candidate_id,job_id,stage | no |
| application_stage_history | candidate | candidate_id | candidate_bucket_id | 3 | history_id,application_id,to_stage | no |
| interviews | candidate | candidate_id | candidate_bucket_id | 4 | interview_id,application_id,round | no |
| assessments | candidate | candidate_id | candidate_bucket_id | 5 | assessment_id,application_id,type | no |
| candidate_outbox | candidate | candidate_id | candidate_bucket_id | — | — | yes (drained before copy, never copied) |

## Exclusions

- `shard_write_gate`, `schema_migrations`: infrastructure, never copied.
- Catalog projections (`employee_directory`, `application_index`, `jobs`, `users`,
  invitations, audit logs), autocomplete indexes: rebuilt from shards, never copied.
- Object-storage objects: keys never encode shard identity, never copied.
