# Shard-Owned Tables Manifest (v1)

Canonical manifest for migration completeness and CI validation.
Every employee-owned table has `employee_id` + `bucket_id NOT NULL` + index.
Candidate tables are declared separately and are NOT part of the employee migration set.

## Employee domain (routing map: employee active version, shards 1-3 + standby 4 on add)

| table | domain | owner key | bucket col | copy order | checksum cols | excluded |
|---|---|---|---|---|---|---|
| employees | employee | employee_id | bucket_id | 1 | employee_id,bucket_id,email,name,status | no |

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
