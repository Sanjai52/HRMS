# Migration file rules

- Name: `NNN_descriptive_name.sql`, one global sequence across catalog and shard scopes (`001`, `002`, …).
- The runner (`../runner.mjs`) applies `*catalog*.sql` to `pg-catalog` and `*shard*.sql` to every shard, in filename order, recording each in `schema_migrations`. Reruns are idempotent.
- **Immutable once executed:** never edit a file that has run anywhere (local, teammate machine, CI). Any change — however small — is a new `NNN` file.
- Every new table with `employee_id`/`candidate_id` must be declared in `docs/shard-owned-tables.md` or CI fails.
