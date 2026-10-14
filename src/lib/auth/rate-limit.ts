/**
 * Small in-memory sliding-window limiter used in front of the OTP endpoints.
 *
 * Limits: this is per server instance. On serverless/multi-instance deployments it is a best-effort
 * speed bump only; the authoritative limits are Supabase Auth's own rate limits (SMS per hour, OTP
 * resend interval) — configure those in the dashboard (see README). Add CAPTCHA before any public launch.
 */
export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export function createRateLimiter(opts: { windowMs: number; max: number; now?: () => number; maxKeys?: number }) {
  const hits = new Map<string, number[]>();
  const now = opts.now ?? (() => Date.now());
  const maxKeys = opts.maxKeys ?? 10_000;

  function prune(key: string, t: number): number[] {
    const fresh = (hits.get(key) ?? []).filter((ts) => t - ts < opts.windowMs);
    if (fresh.length) hits.set(key, fresh);
    else hits.delete(key);
    return fresh;
  }

  return {
    /** Records an attempt and reports whether it is allowed. */
    consume(key: string): RateLimitResult {
      const t = now();
      const fresh = prune(key, t);
      if (fresh.length >= opts.max) {
        const oldest = fresh[0] ?? t;
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((oldest + opts.windowMs - t) / 1000)) };
      }
      if (!hits.has(key) && hits.size >= maxKeys) {
        // Memory guard: drop the oldest key rather than grow without bound.
        const first = hits.keys().next().value;
        if (first !== undefined) hits.delete(first);
      }
      hits.set(key, [...fresh, t]);
      return { allowed: true };
    },
    reset(key: string) {
      hits.delete(key);
    },
  };
}

// One shared limiter per concern (module scope = per server instance).
export const otpSendByPhone = createRateLimiter({ windowMs: 60_000, max: 1 }); // 1 SMS / minute / number
export const otpSendByPhoneHourly = createRateLimiter({ windowMs: 3_600_000, max: 5 }); // 5 SMS / hour / number
export const otpSendByIp = createRateLimiter({ windowMs: 3_600_000, max: 15 }); // 15 SMS / hour / IP
export const otpVerifyByPhone = createRateLimiter({ windowMs: 600_000, max: 8 }); // 8 code attempts / 10 min / number
export const otpVerifyByIp = createRateLimiter({ windowMs: 600_000, max: 30 });
