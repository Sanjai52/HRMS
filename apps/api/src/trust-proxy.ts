/**
 * Parse the `TRUST_PROXY` env value into an Express `trust proxy` setting.
 *
 * Accepts a comma-separated list of IPv4/IPv6 addresses or CIDR subnets and
 * hop counts (a bare integer = number of trusted proxy hops). Anything else
 * throws, so a malformed value fails at boot instead of silently trusting
 * arbitrary forwarded headers. Default at the call site is the Docker bridge
 * subnet `172.16.0.0/12` — narrow enough that direct clients can never spoof
 * `X-Forwarded-For`.
 */
const V4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}(\/(3[0-2]|[12]?\d))?$/;
const V6 = /^[0-9A-Fa-f:]*:[0-9A-Fa-f:]*(\/\d{1,3})?$/;

export function parseTrustProxy(value: string): string | number | Array<string | number> {
  const tokens = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (tokens.length === 0) throw new Error("TRUST_PROXY must contain at least one IP/CIDR or hop count");
  const parsed = tokens.map((token): string | number => {
    if (/^\d+$/.test(token)) return Number(token);
    if (token.includes(":")) {
      if (!V6.test(token)) throw new Error(`invalid TRUST_PROXY token: ${token}`);
      const prefix = token.includes("/") ? Number(token.split("/")[1]) : null;
      if (prefix !== null && prefix > 128) throw new Error(`invalid TRUST_PROXY prefix: ${token}`);
      return token;
    }
    if (V4.test(token)) return token;
    throw new Error(`invalid TRUST_PROXY token: ${token}`);
  });
  return parsed.length === 1 ? parsed[0] : parsed;
}
