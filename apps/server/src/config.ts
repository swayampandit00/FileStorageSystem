import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid number for ${name}`);
  }
  return n;
}

function originList(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: intEnv("PORT", 3001),
  host: process.env.HOST ?? "127.0.0.1",
  storageDir: path.resolve(__dirname, process.env.STORAGE_DIR ?? "../../data/files"),
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgres://mycloud:mycloud_dev_pass@127.0.0.1:5432/mycloud",
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  corsOrigins: originList("CORS_ORIGINS"),
  jwtAccessSecret: required("JWT_ACCESS_SECRET", "dev-only-access-secret-change-me-32chars"),
  jwtRefreshSecret: required("JWT_REFRESH_SECRET", "dev-only-refresh-secret-change-me-32ch"),
  accessTokenTtl: intEnv("ACCESS_TOKEN_TTL", 900),
  refreshTokenTtl: intEnv("REFRESH_TOKEN_TTL", 1209600),
  maxUploadBytes: intEnv("MAX_UPLOAD_BYTES", 50 * 1024 * 1024),
  defaultQuotaBytes: intEnv("DEFAULT_QUOTA_BYTES", 1024 * 1024 * 1024),
  allowedMimePrefixes: (process.env.ALLOWED_MIME_PREFIXES ??
    "image/,text/,application/pdf,application/zip,application/json,video/,audio/,application/vnd.")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  adminEmail: process.env.ADMIN_EMAIL ?? "admin@mycloud.local",
  adminPassword: process.env.ADMIN_PASSWORD ?? "ChangeThisAdminPassword123!",
  trustProxy: process.env.TRUST_PROXY === "true",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI ?? "",
};

export const isProd = config.nodeEnv === "production";
