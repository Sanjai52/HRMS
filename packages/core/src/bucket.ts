import { createHash } from "node:crypto";

export const BUCKET_COUNT = 256;

export function stableEmployeeBucket(uuid: string): number {
  const norm = uuid.toLowerCase();
  const digest = createHash("sha256").update(norm, "utf8").digest();
  return digest.readUInt32BE(0) % BUCKET_COUNT;
}
