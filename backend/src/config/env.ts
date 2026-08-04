import "dotenv/config";

const required = (key: string, fallback?: string): string => {
  const value = process.env[key] ?? fallback;
  if (value === undefined) throw new Error(`missing env var ${key}`);
  return value;
};

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProd: process.env.NODE_ENV === "production",
  port: Number(process.env.PORT ?? 4000),

  mongoUrl: required("MONGO_URL", "mongodb://127.0.0.1:27017/balvahini"),
  mongoTestUrl: process.env.MONGO_TEST_URL ?? "mongodb://127.0.0.1:27017/balvahini_test",

  /** Unset = single-instance mode with in-process fallbacks. */
  redisUrl: process.env.REDIS_URL ?? "",

  jwtSecret: required("JWT_SECRET", "dev-only-change-me"),
  accessTtl: process.env.ACCESS_TOKEN_TTL ?? "15m",
  refreshTtl: process.env.REFRESH_TOKEN_TTL ?? "30d",

  corsOrigin: (process.env.CORS_ORIGIN ?? "http://localhost:5173").split(","),

  /**
   * Where the web app lives. QR codes and invitation links must point here,
   * not at the API — the API has no /join route, so a parent scanning a link
   * built from the request host would land on a 404.
   */
  appUrl: (process.env.APP_URL ?? "http://localhost:5174").replace(/[/]$/, ""),

  devOtp: process.env.DEV_OTP ?? "123456",
  otpTtlSeconds: Number(process.env.OTP_TTL_SECONDS ?? 300),
};

// A default signing secret in production would let anyone mint a super-admin
// token. Fail at boot rather than at the first forged request.
if (env.isProd && env.jwtSecret === "dev-only-change-me") {
  throw new Error("JWT_SECRET must be set to a real secret in production");
}
