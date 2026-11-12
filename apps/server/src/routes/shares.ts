import { Router } from "express";
import fs from "node:fs";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { publicFile, storagePath } from "../services/files.js";
import { bumpDownload, createShare, listShares, resolveShare, revokeShare } from "../services/shares.js";
import { fail, ok } from "../utils/http.js";

export const sharesRouter = Router();

sharesRouter.post("/files/:id/share", requireAuth, async (req, res, next) => {
  try {
    const body = z
      .object({
        password: z.string().min(4).max(64).optional(),
        expiresAt: z.string().datetime().nullable().optional(),
        maxDownloads: z.number().int().positive().max(10000).nullable().optional(),
      })
      .parse(req.body ?? {});
    const result = await createShare({
      userId: req.user!.id,
      fileId: req.params.id,
      password: body.password,
      expiresAt: body.expiresAt ?? null,
      maxDownloads: body.maxDownloads ?? null,
    });
    return ok(res, result, 201);
  } catch (e) {
    next(e);
  }
});

sharesRouter.get("/shares", requireAuth, async (req, res, next) => {
  try {
    return ok(res, await listShares(req.user!.id));
  } catch (e) {
    next(e);
  }
});

sharesRouter.delete("/shares/:id", requireAuth, async (req, res, next) => {
  try {
    await revokeShare(req.user!.id, req.params.id);
    return ok(res, { revoked: true });
  } catch (e) {
    next(e);
  }
});

sharesRouter.get("/public/shares/:token", async (req, res, next) => {
  try {
    const password = typeof req.query.password === "string" ? req.query.password : undefined;
    const { share, file } = await resolveShare(req.params.token, password);
    return ok(res, { file: publicFile(file), share: { hasPassword: Boolean(share.password_hash), expiresAt: share.expires_at } });
  } catch (e) {
    next(e);
  }
});

sharesRouter.get("/public/shares/:token/download", async (req, res, next) => {
  try {
    const password = typeof req.query.password === "string" ? req.query.password : undefined;
    const { share, file } = await resolveShare(req.params.token, password);
    const dest = storagePath(file.storage_name);
    if (!fs.existsSync(dest)) return fail(res, "File data missing", 404, "NOT_FOUND");
    await bumpDownload(share.id);
    res.setHeader("Content-Type", file.mime_type);
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(file.display_name)}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    return fs.createReadStream(dest).pipe(res);
  } catch (e) {
    next(e);
  }
});
