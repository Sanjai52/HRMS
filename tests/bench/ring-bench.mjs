import { createHash, randomUUID } from "node:crypto";
import { buildRing, ownerOfBucket, stableEmployeeBucket } from "@hrms/core";

function h(s) {
  return BigInt("0x" + createHash("sha256").update(s, "utf8").digest("hex"));
}

function moduloOwner(bucket, members) {
  return members[Number(h(`bucket:${bucket}`) % BigInt(members.length))];
}

async function main() {
  const N = 20000;
  const keys = Array.from({ length: N }, (_, i) => (i < 3 ? ["11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222", "123e4567-e89b-12d3-a456-426614174000"][i] : randomUUID()));
  const buckets = keys.map((k) => stableEmployeeBucket(k));
  const before = ["shard-1", "shard-2", "shard-3"];
  const after = [...before, "shard-4"];

  const ringBefore = buildRing(before, 128);
  const ringAfter = buildRing(after, 128);
  let ringMoved = 0;
  const ringOwners = buckets.map((b) => ownerOfBucket(b, ringBefore));
  buckets.forEach((b, i) => {
    if (ownerOfBucket(b, ringAfter) !== ringOwners[i]) ringMoved += 1;
  });

  let modMoved = 0;
  buckets.forEach((b) => {
    if (moduloOwner(b, before) !== moduloOwner(b, after)) modMoved += 1;
  });

  const dist = {};
  for (const b of buckets) {
    const o = ownerOfBucket(b, ringAfter);
    dist[o] = (dist[o] ?? 0) + 1;
  }
  console.log(JSON.stringify({
    keys: N,
    ringRemapPct: Math.round((ringMoved / N) * 1000) / 10,
    moduloRemapPct: Math.round((modMoved / N) * 1000) / 10,
    ringOwnersAfterAdd: dist,
  }, null, 1));
}
main().catch((e) => { console.error(e.message); process.exit(1); });
