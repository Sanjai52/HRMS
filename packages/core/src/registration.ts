/**
 * Local registry write deadline (D-002): a process may keep doing
 * state-changing work only while its last recorded heartbeat send is within
 * `ttlMs - marginMs` of the current monotonic clock. Pure — callers supply
 * monotonic milliseconds (e.g. `Number(process.hrtime.bigint() / 1000000n)`).
 */
export function registrationValid(
  lastSentMonoMs: number | null,
  nowMonoMs: number,
  ttlMs = 30000,
  marginMs = 10000
): boolean {
  if (lastSentMonoMs === null) return false;
  const age = nowMonoMs - lastSentMonoMs;
  if (age < 0) return false; // clock jumped backward — fail closed
  return age < ttlMs - marginMs;
}
