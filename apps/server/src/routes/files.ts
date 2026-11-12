import { Router } from "express";
import fs from "node:fs";
import multer from "multer";
import path from "node:path";
import { z } from "zod";
import { config } from "../config.js";
import { db } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import {
  addCollab,
  copyFile,
  createFolder,
  decorate,
  deleteFile,
  deleteFolder,
  emptyTrash,
  folderTree,
  getAccessibleFile,
  getOwnedFile,
  getOwnedFolder,
  getVersion,
  listCollab,
  listDrive,
  listFolders,
  listVersions,
  moveFile,
  moveFolder,
  publicFile,
  publicFolder,
  purgeFile,
  recentActivity,
  removeCollab,
  renameFile,
  renameFolder,
  replaceFile,
  restoreFile,
  restoreFolder,
  restoreVersion,
  sanitizeName,
  saveUpload,
  setStar,
  sharedWithMe,
  storageBreakdown,
  storagePath,
  touchOpened,
  trashFile,
  trashFolder,
  updateFileMeta,
  usageBytes,
} from "../services/files.js";
import { fail, ok } from "../utils/http.js";

export const filesRouter = Router();
filesRouter.use(requireAuth);

const upload = multer({
  dest: path.join(config.storageDir, ".tmp"),
  limits: { fileSize: config.maxUploadBytes, files: 12 },
});

fs.mkdirSync(path.join(config.storageDir, ".tmp"), { recursive: true });

filesRouter.get("/", async (req, res, next) => {
  try {
    const folderId = typeof req.query.folderId === "string" ? req.query.folderId : null;
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const modeRaw = typeof req.query.mode === "string" ? req.query.mode : "drive";
    const mode = (["drive", "starred", "recent", "trash", "search"].includes(modeRaw) ? modeRaw : "drive") as
      | "drive"
      | "starred"
      | "recent"
      | "trash"
      | "search";
    const { files, folders } = await listDrive(req.user!.id, folderId, q ? "search" : mode, q);
    return ok(res, await decorate(req.user!.id, files, folders));
  } catch (e) {
    next(e);
  }
});

filesRouter.post("/upload", (req, res, next) => {
  upload.array("file", 12)(req, res, async (err) => {
    if (err) {
      return fail(res, "Upload failed or file too large", 413, "TOO_LARGE");
    }
    try {
      const incoming = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (!incoming.length) return fail(res, "No file uploaded", 400);
      const folderId = typeof req.body.folderId === "string" && req.body.folderId ? req.body.folderId : null;
      const saved = [];
      for (const file of incoming) {
        const row = await saveUpload({
          userId: req.user!.id,
          quotaBytes: req.user!.quotaBytes,
          folderId,
          originalName: file.originalname,
          tempPath: file.path,
          claimedMime: file.mimetype || "application/octet-stream",
          size: file.size,
          ip: req.ip,
        });
        saved.push(publicFile(row, { starred: false, kind: "file" }));
      }
      return ok(res, saved, 201);
    } catch (e) {
      next(e);
    }
  });
});

filesRouter.post("/empty-trash", async (req, res, next) => {
  try {
    await emptyTrash(req.user!.id);
    return ok(res, { emptied: true });
  } catch (e) {
    next(e);
  }
});

filesRouter.post("/bulk", async (req, res, next) => {
  try {
    const body = z
      .object({
        action: z.enum(["trash", "restore", "star", "unstar", "purge"]),
        fileIds: z.array(z.string().uuid()).default([]),
        folderIds: z.array(z.string().uuid()).default([]),
      })
      .parse(req.body);
    for (const id of body.fileIds) {
      if (body.action === "trash") await trashFile(req.user!.id, id);
      else if (body.action === "restore") await restoreFile(req.user!.id, id);
      else if (body.action === "purge") await purgeFile(req.user!.id, id);
      else await setStar(req.user!.id, "file", id, body.action === "star");
    }
    for (const id of body.folderIds) {
      if (body.action === "trash") await trashFolder(req.user!.id, id);
      else if (body.action === "restore") await restoreFolder(req.user!.id, id);
      else if (body.action === "purge") await deleteFolder(req.user!.id, id);
      else await setStar(req.user!.id, "folder", id, body.action === "star");
    }
    return ok(res, { ok: true, count: body.fileIds.length + body.folderIds.length });
  } catch (e) {
    next(e);
  }
});

filesRouter.get("/:id", async (req, res, next) => {
  try {
    const { file, permission } = await getAccessibleFile(req.user!.id, req.params.id);
    return ok(res, publicFile(file, { permission, kind: "file" }));
  } catch (e) {
    next(e);
  }
});

function streamFile(res: import("express").Response, file: { storage_name: string; mime_type: string; display_name: string }, inline: boolean) {
  const dest = storagePath(file.storage_name);
  if (!fs.existsSync(dest)) return fail(res, "File data missing", 404, "NOT_FOUND");
  res.setHeader("Content-Type", file.mime_type);
  const disp = inline ? "inline" : "attachment";
  res.setHeader("Content-Disposition", `${disp}; filename="${encodeURIComponent(file.display_name)}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  return fs.createReadStream(dest).pipe(res);
}

filesRouter.get("/:id/download", async (req, res, next) => {
  try {
    const { file } = await getAccessibleFile(req.user!.id, req.params.id);
    await touchOpened(req.user!.id, file.id);
    return streamFile(res, file, false);
  } catch (e) {
    next(e);
  }
});

filesRouter.get("/:id/preview", async (req, res, next) => {
  try {
    const { file } = await getAccessibleFile(req.user!.id, req.params.id);
    await touchOpened(req.user!.id, file.id);
    const previewable =
      file.mime_type.startsWith("image/") ||
      file.mime_type.startsWith("text/") ||
      file.mime_type === "application/pdf" ||
      file.mime_type.startsWith("audio/") ||
      file.mime_type.startsWith("video/") ||
      file.mime_type === "application/json";
    if (!previewable) return fail(res, "Preview not available for this type", 415, "NO_PREVIEW");
    return streamFile(res, file, true);
  } catch (e) {
    next(e);
  }
});

filesRouter.get("/:id/versions", async (req, res, next) => {
  try {
    return ok(res, await listVersions(req.user!.id, req.params.id));
  } catch (e) {
    next(e);
  }
});

filesRouter.post("/:id/replace", (req, res, next) => {
  upload.single("file")(req, res, async (err) => {
    if (err) {
      return fail(res, "Upload failed or file too large", 413, "TOO_LARGE");
    }
    try {
      const incoming = req.file;
      if (!incoming) return fail(res, "No file uploaded", 400);
      const row = await replaceFile({
        userId: req.user!.id,
        quotaBytes: req.user!.quotaBytes,
        fileId: req.params.id,
        originalName: incoming.originalname,
        tempPath: incoming.path,
        claimedMime: incoming.mimetype || "application/octet-stream",
        size: incoming.size,
        ip: req.ip,
      });
      return ok(res, publicFile(row, { kind: "file" }));
    } catch (e) {
      next(e);
    }
  });
});

filesRouter.post("/:id/versions/:versionId/restore", async (req, res, next) => {
  try {
    const file = await restoreVersion(req.user!.id, req.user!.quotaBytes, req.params.id, req.params.versionId);
    return ok(res, publicFile(file, { kind: "file" }));
  } catch (e) {
    next(e);
  }
});

filesRouter.get("/:id/versions/:versionId/download", async (req, res, next) => {
  try {
    const { file, version } = await getVersion(req.user!.id, req.params.id, req.params.versionId);
    return streamFile(
      res,
      {
        storage_name: version.storage_name,
        mime_type: version.mime_type,
        display_name: `${file.display_name}.v${version.version_number}`,
      },
      false
    );
  } catch (e) {
    next(e);
  }
});

filesRouter.get("/:id/versions/:versionId/preview", async (req, res, next) => {
  try {
    const { file, version } = await getVersion(req.user!.id, req.params.id, req.params.versionId);
    const previewable =
      version.mime_type.startsWith("image/") ||
      version.mime_type.startsWith("text/") ||
      version.mime_type === "application/pdf" ||
      version.mime_type.startsWith("audio/") ||
      version.mime_type.startsWith("video/") ||
      version.mime_type === "application/json";
    if (!previewable) return fail(res, "Preview not available for this type", 415, "NO_PREVIEW");
    return streamFile(
      res,
      {
        storage_name: version.storage_name,
        mime_type: version.mime_type,
        display_name: `${file.display_name}.v${version.version_number}`,
      },
      true
    );
  } catch (e) {
    next(e);
  }
});

filesRouter.patch("/:id", async (req, res, next) => {
  try {
    const body = z
      .object({
        displayName: z.string().min(1).max(180).optional(),
        description: z.string().max(500).optional(),
        folderId: z.string().uuid().nullable().optional(),
      })
      .parse(req.body);
    const access = await getAccessibleFile(req.user!.id, req.params.id);
    if (access.permission === "viewer") {
      return fail(res, "Editor or owner access required", 403, "FORBIDDEN");
    }
    if (access.permission !== "owner" && (body.description !== undefined || body.folderId !== undefined)) {
      return fail(res, "Only the owner can move or edit details", 403, "FORBIDDEN");
    }
    let file = access.file;
    if (body.displayName) {
      if (access.permission === "owner") file = await renameFile(req.user!.id, req.params.id, body.displayName);
      else {
        await db.prepare("UPDATE files SET display_name = ?, updated_at = ? WHERE id = ?").run(
          sanitizeName(body.displayName),
          new Date().toISOString(),
          req.params.id
        );
        file = (await getAccessibleFile(req.user!.id, req.params.id)).file;
      }
    }
    if (body.description !== undefined) file = await updateFileMeta(req.user!.id, req.params.id, body.description);
    if (body.folderId !== undefined) file = await moveFile(req.user!.id, req.params.id, body.folderId);
    return ok(res, publicFile(file, { kind: "file" }));
  } catch (e) {
    next(e);
  }
});

filesRouter.post("/:id/copy", async (req, res, next) => {
  try {
    const body = z.object({ folderId: z.string().uuid().nullable().optional() }).parse(req.body ?? {});
    const file = await copyFile(req.user!.id, req.params.id, req.user!.quotaBytes, body.folderId ?? null);
    return ok(res, publicFile(file, { kind: "file" }), 201);
  } catch (e) {
    next(e);
  }
});

filesRouter.post("/:id/star", async (req, res, next) => {
  try {
    const body = z.object({ starred: z.boolean() }).parse(req.body);
    return ok(res, await setStar(req.user!.id, "file", req.params.id, body.starred));
  } catch (e) {
    next(e);
  }
});

filesRouter.post("/:id/restore", async (req, res, next) => {
  try {
    await restoreFile(req.user!.id, req.params.id);
    return ok(res, { restored: true });
  } catch (e) {
    next(e);
  }
});

filesRouter.post("/:id/purge", async (req, res, next) => {
  try {
    await purgeFile(req.user!.id, req.params.id);
    return ok(res, { deleted: true });
  } catch (e) {
    next(e);
  }
});

filesRouter.delete("/:id", async (req, res, next) => {
  try {
    return ok(res, await deleteFile(req.user!.id, req.params.id));
  } catch (e) {
    next(e);
  }
});

filesRouter.get("/:id/collaborators", async (req, res, next) => {
  try {
    return ok(res, await listCollab(req.user!.id, "file", req.params.id));
  } catch (e) {
    next(e);
  }
});

filesRouter.post("/:id/collaborators", async (req, res, next) => {
  try {
    const body = z
      .object({ email: z.string().email(), permission: z.enum(["viewer", "editor"]).default("viewer") })
      .parse(req.body);
    return ok(res, await addCollab(req.user!.id, "file", req.params.id, body.email, body.permission), 201);
  } catch (e) {
    next(e);
  }
});

export const foldersRouter = Router();
foldersRouter.use(requireAuth);

foldersRouter.get("/", async (req, res, next) => {
  try {
    const parentId = typeof req.query.parentId === "string" ? req.query.parentId : null;
    const folders = await listFolders(req.user!.id, parentId);
    return ok(res, folders.map((f) => publicFolder(f)));
  } catch (e) {
    next(e);
  }
});

foldersRouter.get("/tree", async (req, res, next) => {
  try {
    return ok(res, await folderTree(req.user!.id));
  } catch (e) {
    next(e);
  }
});

foldersRouter.post("/", async (req, res, next) => {
  try {
    const body = z
      .object({
        name: z.string().min(1).max(80),
        parentId: z.string().uuid().nullable().optional(),
        color: z.string().max(20).optional(),
      })
      .parse(req.body);
    const folder = await createFolder(req.user!.id, body.name, body.parentId ?? null, body.color);
    return ok(res, publicFolder(folder), 201);
  } catch (e) {
    next(e);
  }
});

foldersRouter.patch("/:id", async (req, res, next) => {
  try {
    const body = z
      .object({
        name: z.string().min(1).max(80).optional(),
        color: z.string().max(20).nullable().optional(),
        parentId: z.string().uuid().nullable().optional(),
      })
      .parse(req.body);
    if (body.parentId !== undefined) await moveFolder(req.user!.id, req.params.id, body.parentId);
    const current = await getOwnedFolder(req.user!.id, req.params.id);
    if (body.name || body.color !== undefined) {
      await renameFolder(req.user!.id, req.params.id, body.name ?? current.name, body.color);
    }
    return ok(res, publicFolder(await getOwnedFolder(req.user!.id, req.params.id)));
  } catch (e) {
    next(e);
  }
});

foldersRouter.post("/:id/star", async (req, res, next) => {
  try {
    const body = z.object({ starred: z.boolean() }).parse(req.body);
    return ok(res, await setStar(req.user!.id, "folder", req.params.id, body.starred));
  } catch (e) {
    next(e);
  }
});

foldersRouter.post("/:id/restore", async (req, res, next) => {
  try {
    await restoreFolder(req.user!.id, req.params.id);
    return ok(res, { restored: true });
  } catch (e) {
    next(e);
  }
});

foldersRouter.delete("/:id", async (req, res, next) => {
  try {
    return ok(res, await deleteFolder(req.user!.id, req.params.id));
  } catch (e) {
    next(e);
  }
});

foldersRouter.get("/:id/collaborators", async (req, res, next) => {
  try {
    return ok(res, await listCollab(req.user!.id, "folder", req.params.id));
  } catch (e) {
    next(e);
  }
});

foldersRouter.post("/:id/collaborators", async (req, res, next) => {
  try {
    const body = z
      .object({ email: z.string().email(), permission: z.enum(["viewer", "editor"]).default("viewer") })
      .parse(req.body);
    return ok(res, await addCollab(req.user!.id, "folder", req.params.id, body.email, body.permission), 201);
  } catch (e) {
    next(e);
  }
});

export const storageRouter = Router();
storageRouter.use(requireAuth);

storageRouter.get("/usage", async (req, res, next) => {
  try {
    const used = await usageBytes(req.user!.id);
    return ok(res, {
      usedBytes: used,
      quotaBytes: req.user!.quotaBytes,
      remainingBytes: Math.max(0, req.user!.quotaBytes - used),
      breakdown: await storageBreakdown(req.user!.id),
    });
  } catch (e) {
    next(e);
  }
});

storageRouter.get("/activity", async (req, res, next) => {
  try {
    return ok(res, await recentActivity(req.user!.id));
  } catch (e) {
    next(e);
  }
});

storageRouter.get("/shared-with-me", async (req, res, next) => {
  try {
    return ok(res, await sharedWithMe(req.user!.id));
  } catch (e) {
    next(e);
  }
});

storageRouter.delete("/collaborators/:id", async (req, res, next) => {
  try {
    await removeCollab(req.user!.id, req.params.id);
    return ok(res, { removed: true });
  } catch (e) {
    next(e);
  }
});
