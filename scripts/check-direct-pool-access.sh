#!/usr/bin/env bash
set -euo pipefail
# Ban direct shard-pool access outside the named exceptions (D-007).
# Allow-list (matched as "<path>:" prefix on git-grep output lines):
#   ShardRouter impl, pool factory, migrations/seeds, tests, benchmark control,
#   read-only health diagnostics.
allow='^(packages/core/src/shard-router\.ts|apps/api/src/db/pools\.ts|apps/api/src/routes/health\.ts|infrastructure/postgres/|tests/|apps/api/test/|packages/core/test/|.*\.bench\.(ts|mjs))'
violations=$(git grep -n --no-color -E 'new Pool\(|from "pg"|from .pg.' -- '*.ts' '*.mjs' 2>/dev/null | grep -v -E "$allow" || true)
if [ -n "$violations" ]; then
  echo "Direct shard-pool access outside ShardRouter exceptions:"
  echo "$violations"
  exit 1
fi
echo "pool-access-ok"
