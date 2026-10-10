import { Redis } from "ioredis";

export interface BucketResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

const LUA = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_per_ms = tonumber(ARGV[2])
local now_ms = tonumber(ARGV[3])
local data = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(data[1])
local ts = tonumber(data[2])
if tokens == nil then
  tokens = capacity
  ts = now_ms
else
  local elapsed = now_ms - ts
  tokens = math.min(capacity, tokens + elapsed * refill_per_ms)
  ts = now_ms
end
local allowed = 0
local retry_after = 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
else
  retry_after = math.ceil((1 - tokens) / refill_per_ms)
end
redis.call('HMSET', key, 'tokens', tokens, 'ts', ts)
redis.call('PEXPIRE', key, ARGV[4])
return {allowed, math.floor(tokens), retry_after}
`;

export class TokenBucket {
  constructor(private redis: Redis, private prefix = "rl") {}

  async take(key: string, capacity: number, windowMs: number): Promise<BucketResult> {
    const refillPerMs = capacity / windowMs;
    const now = Date.now();
    const res = (await this.redis.eval(LUA, 1, `${this.prefix}:${key}`, capacity, refillPerMs, now, windowMs * 2)) as [
      number,
      number,
      number,
    ];
    return { allowed: res[0] === 1, remaining: res[1], retryAfterMs: res[2] };
  }
}
