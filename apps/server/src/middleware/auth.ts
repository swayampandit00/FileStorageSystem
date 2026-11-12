import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { db, publicUser, type UserRow } from "../db.js";
import { fail } from "../utils/http.js";

export type AuthPayload = { sub: string; role: "user" | "admin"; typ: "access" };

declare global {
  namespace Express {
    interface Request {
      user?: ReturnType<typeof publicUser>;
      userRow?: UserRow;
    }
  }
}

function readAccessToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  const cookie = req.cookies?.access_token;
  if (typeof cookie === "string" && cookie.length > 0) return cookie;
  return null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = readAccessToken(req);
  if (!token) return fail(res, "Authentication required", 401, "UNAUTHENTICATED");
  try {
    const payload = jwt.verify(token, config.jwtAccessSecret) as AuthPayload;
    if (payload.typ !== "access") return fail(res, "Invalid token", 401, "UNAUTHENTICATED");
    const row = await db.prepare("SELECT * FROM users WHERE id = ?").get<UserRow>(payload.sub);
    if (!row) return fail(res, "Account not found", 401, "UNAUTHENTICATED");
    if (row.status !== "active") return fail(res, "Account is disabled", 403, "DISABLED");
    req.userRow = row;
    req.user = publicUser(row);
    return next();
  } catch {
    return fail(res, "Invalid or expired token", 401, "UNAUTHENTICATED");
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== "admin") {
    return fail(res, "Admin access required", 403, "FORBIDDEN");
  }
  return next();
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = readAccessToken(req);
  if (!token) return next();
  try {
    const payload = jwt.verify(token, config.jwtAccessSecret) as AuthPayload;
    const row = await db.prepare("SELECT * FROM users WHERE id = ?").get<UserRow>(payload.sub);
    if (row && row.status === "active") {
      req.userRow = row;
      req.user = publicUser(row);
    }
  } catch {
    // ignore
  }
  return next();
}
