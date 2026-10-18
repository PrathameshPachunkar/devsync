import { z } from "zod";

const flag = z
  .enum(["true", "false", "1", "0"])
  .transform((value) => value === "true" || value === "1");

const DEV_JWT_SECRET = "devsync-local-development-secret-change-me-0123456789";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  /** Postgres connection string. Without it, embedded PGlite is used (dev only). */
  DATABASE_URL: z.string().min(1).optional(),
  /** PGlite data directory, or "memory" for a throwaway database. */
  PGLITE_DATA_DIR: z.string().default(".data/pglite"),

  /** Comma-separated browser origins allowed to call the API with cookies. */
  WEB_ORIGINS: z.string().default("http://localhost:3000"),
  /** Where OAuth callbacks send the user afterwards. */
  WEB_URL: z.url().default("http://localhost:3000"),
  API_PUBLIC_URL: z.url().default("http://localhost:4000"),
  TRUST_PROXY: flag.default(false),

  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters").optional(),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(14),
  /** e.g. ".devsync.app" so the web app on a sibling subdomain can see the session. */
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: flag.optional(),

  /** Requests per 15 minutes per IP on login, register, and demo. */
  AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(30),
  DEMO_ENABLED: flag.default(true),

  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
});

export interface AppConfig {
  env: "development" | "test" | "production";
  port: number;
  logLevel: string;
  database: { kind: "postgres"; url: string } | { kind: "pglite"; dataDir: string | undefined };
  webOrigins: string[];
  webUrl: string;
  apiPublicUrl: string;
  trustProxy: boolean;
  jwtSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
  cookieDomain: string | undefined;
  cookieSecure: boolean;
  authRateLimit: number;
  demoEnabled: boolean;
  github: { clientId: string; clientSecret: string } | null;
}

export class ConfigError extends Error {
  override name = "ConfigError";
}

export function loadConfig(source: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
    throw new ConfigError(`Invalid environment:\n${issues.join("\n")}`);
  }
  const env = parsed.data;
  const production = env.NODE_ENV === "production";

  if (production && !env.DATABASE_URL)
    throw new ConfigError("DATABASE_URL is required in production");
  if (production && !env.JWT_SECRET) throw new ConfigError("JWT_SECRET is required in production");

  return {
    env: env.NODE_ENV,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    database: env.DATABASE_URL
      ? { kind: "postgres", url: env.DATABASE_URL }
      : {
          kind: "pglite",
          dataDir: env.PGLITE_DATA_DIR === "memory" ? undefined : env.PGLITE_DATA_DIR,
        },
    webOrigins: env.WEB_ORIGINS.split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean),
    webUrl: env.WEB_URL.replace(/\/$/, ""),
    apiPublicUrl: env.API_PUBLIC_URL.replace(/\/$/, ""),
    trustProxy: env.TRUST_PROXY,
    jwtSecret: env.JWT_SECRET ?? DEV_JWT_SECRET,
    accessTokenTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
    cookieDomain: env.COOKIE_DOMAIN || undefined,
    cookieSecure: env.COOKIE_SECURE ?? production,
    authRateLimit: env.AUTH_RATE_LIMIT,
    demoEnabled: env.DEMO_ENABLED,
    github:
      env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
        ? { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET }
        : null,
  };
}
