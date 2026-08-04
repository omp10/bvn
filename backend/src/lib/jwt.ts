import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env.js";
import type { RequestContext, Role } from "./context.js";
import { unauthorized } from "./errors.js";

export type AccessClaims = RequestContext & { typ: "access" };
export type RefreshClaims = { userId: string; typ: "refresh"; jti: string };

// The TTLs come from env as plain strings ("15m"); the type is a branded
// template literal, so the cast happens once here rather than at each call.
const ttl = (value: string) => value as SignOptions["expiresIn"];

export const signAccessToken = (ctx: RequestContext): string =>
  jwt.sign({ ...ctx, typ: "access" }, env.jwtSecret, { expiresIn: ttl(env.accessTtl) });

export const signRefreshToken = (userId: string, jti: string): string =>
  jwt.sign({ userId, typ: "refresh", jti }, env.jwtSecret, { expiresIn: ttl(env.refreshTtl) });

export function verifyAccessToken(token: string): AccessClaims {
  const claims = verify(token);
  // A refresh token must never be accepted as an access token.
  if (claims.typ !== "access") throw unauthorized("invalid token type");
  return claims as AccessClaims;
}

export function verifyRefreshToken(token: string): RefreshClaims {
  const claims = verify(token);
  if (claims.typ !== "refresh") throw unauthorized("invalid token type");
  return claims as unknown as RefreshClaims;
}

function verify(token: string): { typ?: string; role?: Role } & Record<string, unknown> {
  try {
    return jwt.verify(token, env.jwtSecret) as never;
  } catch {
    throw unauthorized("invalid or expired token");
  }
}

export const bearerFrom = (header?: string): string | undefined =>
  header?.startsWith("Bearer ") ? header.slice(7).trim() : undefined;
