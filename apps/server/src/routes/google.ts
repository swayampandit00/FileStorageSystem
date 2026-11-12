import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { requireAuth } from "../middleware/auth.js";
import {
  connectUrl,
  disconnect,
  finishOAuth,
  googleConfigured,
  importGoogleItems,
  listGoogleFiles,
  parseOAuthState,
  statusFor,
} from "../services/google.js";
import { fail, ok } from "../utils/http.js";

export const googleRouter = Router();

function frontendRedirect(query: Record<string, string>) {
  const url = new URL("/app/import-google", config.webOrigin);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return url.toString();
}

googleRouter.get("/status", requireAuth, async (req, res, next) => {
  try {
    return ok(res, await statusFor(req.user!.id));
  } catch (e) {
    next(e);
  }
});

googleRouter.get("/connect", requireAuth, (req, res, next) => {
  try {
    return ok(res, { url: connectUrl(req.user!.id) });
  } catch (e) {
    next(e);
  }
});

googleRouter.get("/callback", async (req, res) => {
  const err = typeof req.query.error === "string" ? req.query.error : null;
  if (err) return res.redirect(frontendRedirect({ google: "denied" }));
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  if (!code || !state) return res.redirect(frontendRedirect({ google: "missing" }));
  try {
    const userId = parseOAuthState(state);
    await finishOAuth(userId, code);
    return res.redirect(frontendRedirect({ google: "connected" }));
  } catch {
    return res.redirect(frontendRedirect({ google: "failed" }));
  }
});

googleRouter.delete("/", requireAuth, async (req, res, next) => {
  try {
    await disconnect(req.user!.id);
    return ok(res, { disconnected: true });
  } catch (e) {
    next(e);
  }
});

googleRouter.get("/files", requireAuth, async (req, res, next) => {
  try {
    const parentId = typeof req.query.parentId === "string" && req.query.parentId ? req.query.parentId : "root";
    const pageToken = typeof req.query.pageToken === "string" ? req.query.pageToken : undefined;
    return ok(res, await listGoogleFiles(req.user!.id, parentId, pageToken));
  } catch (e) {
    next(e);
  }
});

googleRouter.post("/import", requireAuth, async (req, res, next) => {
  try {
    const body = z
      .object({
        folderId: z.string().uuid().nullable().optional(),
        items: z
          .array(
            z.object({
              id: z.string().min(1).max(128),
              name: z.string().max(240).optional(),
              mimeType: z.string().max(200).optional(),
            })
          )
          .min(1)
          .max(50),
      })
      .parse(req.body);
    if (!googleConfigured()) return fail(res, "Google Drive is not configured", 400, "GOOGLE_NOT_CONFIGURED");
    const result = await importGoogleItems({
      userId: req.user!.id,
      quotaBytes: req.user!.quotaBytes,
      destFolderId: body.folderId ?? null,
      items: body.items,
      ip: req.ip,
    });
    return ok(res, result, 201);
  } catch (e) {
    next(e);
  }
});
