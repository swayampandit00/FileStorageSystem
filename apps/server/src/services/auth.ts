import jwt from "jsonwebtoken";
import { z } from "zod";
import { config, isProd } from "../config.js";
import { audit, db, publicUser, type UserRow } from "../db.js";
import { hashPassword, randomId, sha256, verifyPassword } from "../utils/crypto.js";

export const registerSchema = z.object({
  email: z.string().email().max(200),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .max(128)
    .regex(/[A-Z]/, "Password needs an uppercase letter")
    .regex(/[a-z]/, "Password needs a lowercase letter")
    .regex(/[0-9]/, "Password needs a number"),
  displayName: z.string().min(2).max(80),
});

export const loginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(128),
});

export function cookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeMs,
  };
}

export function signAccess(user: UserRow): string {
  return jwt.sign({ sub: user.id, role: user.role, typ: "access" }, config.jwtAccessSecret, {
    expiresIn: config.accessTokenTtl,
  } as jwt.SignOptions);
}

export async function issueRefresh(userId: string): Promise<string> {
  const raw = randomId() + randomId();
  const now = new Date();
  const expires = new Date(now.getTime() + config.refreshTokenTtl * 1000);
  await db.prepare(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(randomId(), userId, sha256(raw), expires.toISOString(), now.toISOString());
  return raw;
}

export async function rotateRefresh(oldRaw: string): Promise<{ user: UserRow; refresh: string } | null> {
  const hash = sha256(oldRaw);
  const row = await db
    .prepare(`SELECT user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = ?`)
    .get<{ user_id: string; expires_at: string; revoked_at: string | null }>(hash);
  if (!row || row.revoked_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  const user = await db.prepare("SELECT * FROM users WHERE id = ?").get<UserRow>(row.user_id);
  if (!user || user.status !== "active") return null;
  await db.prepare("UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ?").run(
    new Date().toISOString(),
    hash
  );
  return { user, refresh: await issueRefresh(user.id) };
}

export async function revokeRefresh(raw: string) {
  await db.prepare("UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ?").run(
    new Date().toISOString(),
    sha256(raw)
  );
}

export async function registerUser(input: z.infer<typeof registerSchema>, ip?: string) {
  const email = input.email.toLowerCase();
  const exists = await db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (exists) {
    throw Object.assign(new Error("Email already registered"), { status: 409, code: "EMAIL_TAKEN" });
  }
  const now = new Date().toISOString();
  const id = randomId();
  const passwordHash = await hashPassword(input.password);
  await db.prepare(
    `INSERT INTO users (id, email, password_hash, display_name, role, status, quota_bytes, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'user', 'active', ?, ?, ?)`
  ).run(id, email, passwordHash, input.displayName, config.defaultQuotaBytes, now, now);
  const user = await db.prepare("SELECT * FROM users WHERE id = ?").get<UserRow>(id);
  if (!user) throw new Error("Failed to create user");
  await audit(id, "auth.register", { targetType: "user", targetId: id, ip });
  return user;
}

export async function loginUser(input: z.infer<typeof loginSchema>, ip?: string) {
  const email = input.email.toLowerCase();
  const user = await db.prepare("SELECT * FROM users WHERE email = ?").get<UserRow>(email);
  if (!user) {
    throw Object.assign(new Error("Invalid email or password"), { status: 401, code: "INVALID_CREDENTIALS" });
  }
  const ok = await verifyPassword(input.password, user.password_hash);
  if (!ok) {
    await audit(user.id, "auth.login_failed", { ip });
    throw Object.assign(new Error("Invalid email or password"), { status: 401, code: "INVALID_CREDENTIALS" });
  }
  if (user.status !== "active") {
    throw Object.assign(new Error("Account is disabled"), { status: 403, code: "DISABLED" });
  }
  await audit(user.id, "auth.login", { ip });
  return user;
}

export async function sessionPayload(user: UserRow) {
  const accessToken = signAccess(user);
  const refreshToken = await issueRefresh(user.id);
  return {
    user: publicUser(user),
    accessToken,
    refreshToken,
    expiresIn: config.accessTokenTtl,
  };
}
