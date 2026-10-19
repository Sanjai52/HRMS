// Snowflake ID generator bench (NFR-ID-01): single-worker throughput plus a
// 4-thread cross-worker uniqueness run. No database needed — the durable
// worker-id lease lives in id-issuer.test.ts; this measures generation only.
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { Snowflake } from "@hrms/core";

const SINGLE_WORKER_IDS = 200_000;
const WORKERS = 4;
const PER_WORKER = 50_000;
const LEASE_MS = 3_600_000;

if (!isMainThread) {
  const gen = new Snowflake(workerData.workerId);
  const leaseValidUntil = Date.now() + LEASE_MS;
  const ids = new Array(PER_WORKER);
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < PER_WORKER; i++) ids[i] = gen.next(leaseValidUntil);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  parentPort.postMessage({ ids, ms });
} else {
  const gen = new Snowflake(7);
  const leaseValidUntil = Date.now() + LEASE_MS;
  let t0 = process.hrtime.bigint();
  for (let i = 0; i < SINGLE_WORKER_IDS; i++) gen.next(leaseValidUntil);
  const singleMs = Number(process.hrtime.bigint() - t0) / 1e6;

  t0 = process.hrtime.bigint();
  const results = await Promise.all(
    Array.from(
      { length: WORKERS },
      (_, i) =>
        new Promise((resolve, reject) => {
          const w = new Worker(new URL(import.meta.url), { workerData: { workerId: 100 + i } });
          w.once("message", resolve);
          w.once("error", reject);
        })
    )
  );
  const combinedMs = Number(process.hrtime.bigint() - t0) / 1e6;

  const unique = new Set();
  for (const r of results) for (const id of r.ids) unique.add(id);
  const total = WORKERS * PER_WORKER;

  console.log(JSON.stringify({
    idsPerSecSingleWorker: Math.round(SINGLE_WORKER_IDS / (singleMs / 1000)),
    singleWorkerIds: SINGLE_WORKER_IDS,
    singleWorkerMs: Math.round(singleMs),
    workers: WORKERS,
    perWorker: PER_WORKER,
    totalIds: total,
    uniqueIds: unique.size,
    duplicates: total - unique.size,
    idsPerSecCombined: Math.round(total / (combinedMs / 1000)),
    combinedMs: Math.round(combinedMs),
  }, null, 1));
}
