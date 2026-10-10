import { createHash } from "node:crypto";

export interface RingPoint {
  hash: bigint;
  shardId: string;
}

function hashStr(s: string): bigint {
  return BigInt("0x" + createHash("sha256").update(s, "utf8").digest("hex"));
}

export const VIRTUAL_NODES = 128;

export function buildRing(members: string[], v: number = VIRTUAL_NODES): RingPoint[] {
  const pts: RingPoint[] = [];
  for (const m of members) {
    for (let i = 0; i < v; i++) {
      pts.push({ hash: hashStr(`${m}:${i}`), shardId: m });
    }
  }
  return pts.sort((a, b) => (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0));
}

export function ownerOfBucket(bucket: number, ring: RingPoint[]): string {
  const bh = hashStr(`bucket:${bucket}`);
  for (const p of ring) {
    if (p.hash >= bh) return p.shardId;
  }
  return ring[0].shardId;
}
