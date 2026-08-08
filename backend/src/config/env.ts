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
  /**
   * Returns a fixed OTP in the response instead of sending an SMS.
   *
   * Automatic outside production. In production it must be switched on
   * deliberately, because it lets anyone who knows a parent's mobile number
   * sign in as them. It exists so the platform is demonstrable before an SMS
   * gateway is connected — turn it off the day one is.
   */
  otpDevMode: process.env.OTP_DEV_MODE === "true" || process.env.NODE_ENV !== "production",
  otpTtlSeconds: Number(process.env.OTP_TTL_SECONDS ?? 300),

  /**
   * Rate limits, per window. Raised while a deployment is being tested and
   * tightened from the environment for real traffic — a code change should not
   * be needed to harden a running box.
   */
  rateLimits: {
    api: Number(process.env.RATE_LIMIT_API ?? 1200),        // per minute
    auth: Number(process.env.RATE_LIMIT_AUTH ?? 60),        // per 15 minutes
    otp: Number(process.env.RATE_LIMIT_OTP ?? 30),          // per 10 minutes
    tracking: Number(process.env.RATE_LIMIT_TRACKING ?? 240), // per minute
  },
};

// A default signing secret in production would let anyone mint a super-admin
// token. Fail at boot rather than at the first forged request.
if (env.isProd && env.jwtSecret === "dev-only-change-me") {
  throw new Error("JWT_SECRET must be set to a real secret in production");
}
