import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { config } from "../config.js";
import { db, publicUser, type UserRow } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import {
  cookieOptions,
  loginSchema,
  loginUser,
  registerSchema,
  registerUser,
  revokeRefresh,
  rotateRefresh,
  sessionPayload,
  signAccess,
} from "../services/auth.js";
import { hashPassword, verifyPassword } from "../utils/crypto.js";
import { fail, ok } from "../utils/http.js";

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: { ok: false, error: { message: "Too many attempts. Try later.", code: "RATE_LIMIT" } },
});

function setAuthCookies(res: import("express").Response, access: string, refresh: string) {
  res.cookie("access_token", access, cookieOptions(config.accessTokenTtl * 1000));
  res.cookie("refresh_token", refresh, cookieOptions(config.refreshTokenTtl * 1000));
}

function clearAuthCookies(res: import("express").Response) {
  res.clearCookie("access_token", { path: "/" });
  res.clearCookie("refresh_token", { path: "/" });
}

authRouter.post("/register", authLimiter, async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    const user = await registerUser(body, req.ip);
    const session = await sessionPayload(user);
    setAuthCookies(res, session.accessToken, session.refreshToken);
    return ok(res, session, 201);
  } catch (e) {
    next(e);
  }
});

authRouter.post("/login", authLimiter, async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const user = await loginUser(body, req.ip);
    const session = await sessionPayload(user);
    setAuthCookies(res, session.accessToken, session.refreshToken);
    return ok(res, session);
  } catch (e) {
    next(e);
  }
});

authRouter.post("/refresh", async (req, res) => {
  const raw = (req.body?.refreshToken as string | undefined) || req.cookies?.refresh_token;
  if (!raw) return fail(res, "Refresh token required", 401, "UNAUTHENTICATED");
  const rotated = await rotateRefresh(raw);
  if (!rotated) {
    clearAuthCookies(res);
    return fail(res, "Refresh token invalid", 401, "UNAUTHENTICATED");
  }
  const session = {
    user: {
      id: rotated.user.id,
      email: rotated.user.email,
      displayName: rotated.user.display_name,
      role: rotated.user.role,
      status: rotated.user.status,
      quotaBytes: rotated.user.quota_bytes,
      createdAt: rotated.user.created_at,
    },
    accessToken: signAccess(rotated.user),
    refreshToken: rotated.refresh,
    expiresIn: config.accessTokenTtl,
  };
  setAuthCookies(res, session.accessToken, session.refreshToken);
  return ok(res, session);
});

authRouter.post("/logout", async (req, res) => {
  const raw = (req.body?.refreshToken as string | undefined) || req.cookies?.refresh_token;
  if (raw) await revokeRefresh(raw);
  clearAuthCookies(res);
  return ok(res, { loggedOut: true });
});

authRouter.get("/me", requireAuth, (req, res) => {
  return ok(res, { user: req.user });
});

authRouter.patch("/me", requireAuth, async (req, res, next) => {
  try {
    const body = z
      .object({
        displayName: z.string().min(2).max(80).optional(),
        currentPassword: z.string().min(1).max(128).optional(),
        newPassword: z
          .string()
          .min(10)
          .max(128)
          .regex(/[A-Z]/)
          .regex(/[a-z]/)
          .regex(/[0-9]/)
          .optional(),
      })
      .parse(req.body);
    const row = await db.prepare("SELECT * FROM users WHERE id = ?").get<UserRow>(req.user!.id);
    if (!row) return fail(res, "Account not found", 401, "UNAUTHENTICATED");
    if (body.newPassword) {
      if (!body.currentPassword) return fail(res, "Current password required", 400);
      const okPw = await verifyPassword(body.currentPassword, row.password_hash);
      if (!okPw) return fail(res, "Current password is incorrect", 401, "INVALID_CREDENTIALS");
      await db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(
        await hashPassword(body.newPassword),
        new Date().toISOString(),
        row.id
      );
    }
    if (body.displayName) {
      await db.prepare("UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?").run(
        body.displayName,
        new Date().toISOString(),
        row.id
      );
    }
    const updated = await db.prepare("SELECT * FROM users WHERE id = ?").get<UserRow>(row.id);
    if (!updated) return fail(res, "Account not found", 401, "UNAUTHENTICATED");
    return ok(res, { user: publicUser(updated) });
  } catch (e) {
    next(e);
  }
});
