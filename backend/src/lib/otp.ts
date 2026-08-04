import { env } from "../config/env.js";
import { randomOtp } from "./codes.js";
import { badRequest, unauthorized } from "./errors.js";
import { redis } from "./redis.js";

type Entry = { code: string; expiresAt: number; attempts: number };

/**
 * OTP storage.
 *
 * Redis when configured, an in-process Map otherwise. With more than one Node
 * instance the Map is wrong — a parent who requests a code on instance A cannot
 * verify it on instance B — so the fallback exists for local development only.
 */
const memory = new Map<string, Entry>();
const MAX_ATTEMPTS = 5;

const key = (schoolCode: string, phone: string) => `otp:${schoolCode}:${phone}`;

export async function issueOtp(schoolCode: string, phone: string): Promise<{ code: string; devCode?: string }> {
  // A fixed, returned code while no SMS gateway exists; a real random one the
  // moment OTP_DEV_MODE is off.
  const code = env.otpDevMode ? env.devOtp : randomOtp();
  const k = key(schoolCode, phone);

  const r = redis();
  if (r) {
    // Code and attempt counter share a TTL so they expire together.
    await r.multi().set(k, code, "EX", env.otpTtlSeconds).del(`${k}:tries`).exec();
  } else {
    memory.set(k, { code, expiresAt: Date.now() + env.otpTtlSeconds * 1000, attempts: 0 });
  }

  return { code, devCode: env.otpDevMode ? code : undefined };
}

export async function verifyOtp(schoolCode: string, phone: string, code: string): Promise<void> {
  const k = key(schoolCode, phone);
  const r = redis();

  if (r) {
    const stored = await r.get(k);
    if (!stored) throw badRequest("that code has expired — request a new one");

    // Bounded attempts: a 6-digit code is brute-forceable in seconds otherwise.
    const tries = await r.incr(`${k}:tries`);
    if (tries === 1) await r.expire(`${k}:tries`, env.otpTtlSeconds);
    if (tries > MAX_ATTEMPTS) {
      await r.del(k, `${k}:tries`);
      throw unauthorized("too many attempts — request a new OTP");
    }

    if (stored !== code) throw unauthorized("incorrect OTP");
    await r.del(k, `${k}:tries`); // single use
    return;
  }

  const entry = memory.get(k);
  if (!entry) throw badRequest("request an OTP first");
  if (Date.now() > entry.expiresAt) {
    memory.delete(k);
    throw badRequest("that code has expired — request a new one");
  }
  if (++entry.attempts > MAX_ATTEMPTS) {
    memory.delete(k);
    throw unauthorized("too many attempts — request a new OTP");
  }
  if (entry.code !== code) throw unauthorized("incorrect OTP");
  memory.delete(k);
}

/** Redis expires its own keys; the Map needs sweeping. */
setInterval(() => {
  const now = Date.now();
  for (const [k, entry] of memory) if (entry.expiresAt < now) memory.delete(k);
}, 60_000).unref();
