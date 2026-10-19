#!/usr/bin/env bash
set -euo pipefail
# Ban direct shard-pool access outside the named exceptions (D-007).
# Allow-list (matched as "<path>:" prefix on git-grep output lines):
#   ShardRouter impl, pool factory, migrations/seeds, tests, benchmark control,
#   read-only health diagnostics.
allow='^(packages/core/src/shard-router\.ts|apps/api/src/db/pools\.ts|apps/worker/src/pools\.ts|apps/api/src/routes/health\.ts|infrastructure/postgres/|tests/|apps/api/test/|packages/core/test/|.*\.bench\.(ts|mjs))'
violations=$(git grep -n --no-color -E 'new Pool\(|from "pg"|from .pg.' -- '*.ts' '*.mjs' 2>/dev/null | grep -v -E "$allow" || true)
if [ -n "$violations" ]; then
  echo "Direct shard-pool access outside ShardRouter exceptions:"
  echo "$violations"
  exit 1
fi
# Rule 2: route code must reach shards through db/shards.ts helpers
# (poolFor / ownedShardPools / allShardPools), never the raw shardPools map.
# Exception: pool factory, the shards helper itself, migration engine,
# read-only health diagnostics, and the worker pool wiring.
shard_allow='^(apps/api/src/db/pools\.ts:|apps/api/src/db/shards\.ts:|apps/api/src/migration/|apps/api/src/routes/health\.ts:|apps/worker/src/pools\.ts:|apps/worker/src/index\.ts:)'
shard_violations=$(git grep -n --no-color 'shardPools' -- 'apps/api/src' 'packages/core/src' 'apps/worker/src' 2>/dev/null | grep -v -E "$shard_allow" || true)
if [ -n "$shard_violations" ]; then
  echo "Direct shardPools access outside db/shards.ts (use ownedShardPools()/poolFor()):"
  echo "$shard_violations"
  exit 1
fi
echo "pool-access-ok"
