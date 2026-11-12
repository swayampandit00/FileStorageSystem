import { Router } from "express";
import { z } from "zod";
import { audit, db, publicUser, type UserRow } from "../db.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { usageBytes } from "../services/files.js";
import { ok } from "../utils/http.js";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

adminRouter.get("/users", async (req, res, next) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const rows = q
      ? await db
          .prepare("SELECT * FROM users WHERE email LIKE ? OR display_name LIKE ? ORDER BY created_at DESC")
          .all<UserRow>(`%${q}%`, `%${q}%`)
      : await db.prepare("SELECT * FROM users ORDER BY created_at DESC").all<UserRow>();
    const users = await Promise.all(
      rows.map(async (u) => ({
        ...publicUser(u),
        usedBytes: await usageBytes(u.id),
      }))
    );
    return ok(res, users);
  } catch (e) {
    next(e);
  }
});

adminRouter.patch("/users/:id", async (req, res, next) => {
  try {
    const body = z
      .object({
        status: z.enum(["active", "disabled"]).optional(),
        quotaBytes: z.number().int().positive().max(1099511627776).optional(),
        role: z.enum(["user", "admin"]).optional(),
      })
      .parse(req.body);
    const user = await db.prepare("SELECT * FROM users WHERE id = ?").get<UserRow>(req.params.id);
    if (!user) {
      throw Object.assign(new Error("User not found"), { status: 404, code: "NOT_FOUND" });
    }
    if (user.id === req.user!.id && body.status === "disabled") {
      throw Object.assign(new Error("You cannot disable your own account"), { status: 400 });
    }
    const status = body.status ?? user.status;
    const quota = body.quotaBytes ?? user.quota_bytes;
    const role = body.role ?? user.role;
    await db.prepare("UPDATE users SET status = ?, quota_bytes = ?, role = ?, updated_at = ? WHERE id = ?").run(
      status,
      quota,
      role,
      new Date().toISOString(),
      user.id
    );
    await audit(req.user!.id, "admin.user.update", {
      targetType: "user",
      targetId: user.id,
      ip: req.ip,
      detail: JSON.stringify({ status, quota, role }),
    });
    const updated = await db.prepare("SELECT * FROM users WHERE id = ?").get<UserRow>(user.id);
    if (!updated) throw Object.assign(new Error("User not found"), { status: 404, code: "NOT_FOUND" });
    return ok(res, { ...publicUser(updated), usedBytes: await usageBytes(updated.id) });
  } catch (e) {
    next(e);
  }
});

adminRouter.get("/audit", async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const rows = await db
      .prepare(
        `SELECT a.*, u.email AS actor_email
         FROM audit_events a
         LEFT JOIN users u ON u.id = a.actor_id
         ORDER BY a.created_at DESC LIMIT ?`
      )
      .all(limit);
    return ok(res, rows);
  } catch (e) {
    next(e);
  }
});

adminRouter.get("/stats", async (_req, res, next) => {
  try {
    const users = (await db.prepare("SELECT COUNT(*) AS c FROM users").get<{ c: number }>())!.c;
    const files = (await db.prepare("SELECT COUNT(*) AS c FROM files WHERE trashed_at IS NULL").get<{ c: number }>())!.c;
    const trashed = (await db.prepare("SELECT COUNT(*) AS c FROM files WHERE trashed_at IS NOT NULL").get<{ c: number }>())!.c;
    const bytes = (await db.prepare("SELECT COALESCE(SUM(size_bytes),0) AS c FROM files").get<{ c: number }>())!.c;
    const shares = (await db.prepare("SELECT COUNT(*) AS c FROM shares WHERE revoked_at IS NULL").get<{ c: number }>())!.c;
    const collabs = (await db.prepare("SELECT COUNT(*) AS c FROM collab_shares").get<{ c: number }>())!.c;
    const breakdown = await db
      .prepare(
        `SELECT
           CASE
             WHEN mime_type LIKE 'image/%' THEN 'Images'
             WHEN mime_type LIKE 'video/%' THEN 'Videos'
             WHEN mime_type LIKE 'audio/%' THEN 'Audio'
             WHEN mime_type LIKE 'text/%' OR mime_type = 'application/pdf' THEN 'Documents'
             ELSE 'Other'
           END AS category,
           COUNT(*) AS count,
           COALESCE(SUM(size_bytes), 0) AS bytes
         FROM files WHERE trashed_at IS NULL GROUP BY 1`
      )
      .all();
    const topUsers = await db
      .prepare(
        `SELECT u.id, u.email, u.display_name, u.quota_bytes,
                COALESCE(SUM(f.size_bytes), 0) AS used_bytes,
                COUNT(f.id) AS file_count
         FROM users u LEFT JOIN files f ON f.user_id = u.id
         GROUP BY u.id ORDER BY used_bytes DESC LIMIT 10`
      )
      .all();
    return ok(res, { users, files, trashed, bytes, shares, collabs, breakdown, topUsers });
  } catch (e) {
    next(e);
  }
});
