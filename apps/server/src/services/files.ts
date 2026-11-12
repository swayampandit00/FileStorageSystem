import fs from "node:fs";
import path from "node:path";
import { fileTypeFromFile } from "file-type";
import { config } from "../config.js";
import { audit, db, trackActivity } from "../db.js";
import { randomId } from "../utils/crypto.js";

export type FileRow = {
  id: string;
  user_id: string;
  folder_id: string | null;
  display_name: string;
  storage_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  updated_at: string;
  trashed_at: string | null;
  description: string | null;
  last_opened_at: string | null;
};

export type FolderRow = {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  created_at: string;
  updated_at: string;
  trashed_at: string | null;
  color: string | null;
  description: string | null;
};

export type FileVersionRow = {
  id: string;
  file_id: string;
  version_number: number;
  storage_name: string;
  mime_type: string;
  size_bytes: number;
  created_by: string | null;
  created_at: string;
};

export function publicVersion(row: FileVersionRow) {
  return {
    id: row.id,
    fileId: row.file_id,
    versionNumber: row.version_number,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export function publicFile(row: FileRow, extra: Record<string, unknown> = {}) {
  return {
    id: row.id,
    ownerId: row.user_id,
    folderId: row.folder_id,
    displayName: row.display_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    trashedAt: row.trashed_at,
    description: row.description,
    lastOpenedAt: row.last_opened_at,
    ...extra,
  };
}

export function publicFolder(row: FolderRow, extra: Record<string, unknown> = {}) {
  return {
    id: row.id,
    ownerId: row.user_id,
    name: row.name,
    parentId: row.parent_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    trashedAt: row.trashed_at,
    color: row.color,
    description: row.description,
    ...extra,
  };
}

export function storagePath(storageName: string): string {
  const resolved = path.resolve(config.storageDir, storageName);
  const root = path.resolve(config.storageDir);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw Object.assign(new Error("Invalid storage path"), { status: 400 });
  }
  return resolved;
}

export async function usageBytes(userId: string): Promise<number> {
  const files = await db.prepare("SELECT COALESCE(SUM(size_bytes), 0) AS total FROM files WHERE user_id = ?").get(userId) as {
    total: number;
  };
  const versions = await db
    .prepare(
      `SELECT COALESCE(SUM(v.size_bytes), 0) AS total
       FROM file_versions v JOIN files f ON f.id = v.file_id
       WHERE f.user_id = ?`
    )
    .get(userId) as { total: number };
  return Number(files.total) + Number(versions.total);
}

function mimeAllowed(mime: string): boolean {
  return config.allowedMimePrefixes.some((prefix) => mime.startsWith(prefix) || mime === prefix);
}

export function sanitizeName(name: string, max = 180): string {
  return path.basename(name).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, max) || "untitled";
}

export async function isStarred(userId: string, itemType: "file" | "folder", itemId: string): Promise<boolean> {
  return Boolean(
    await db.prepare("SELECT 1 FROM stars WHERE user_id = ? AND item_type = ? AND item_id = ?").get(userId, itemType, itemId)
  );
}

export async function getOwnedFile(userId: string, fileId: string): Promise<FileRow> {
  const row = await db.prepare("SELECT * FROM files WHERE id = ? AND user_id = ?").get(fileId, userId) as FileRow | undefined;
  if (!row) throw Object.assign(new Error("File not found"), { status: 404, code: "NOT_FOUND" });
  return row;
}

export async function getOwnedFolder(userId: string, folderId: string): Promise<FolderRow> {
  const row = await db.prepare("SELECT * FROM folders WHERE id = ? AND user_id = ?").get(folderId, userId) as
    | FolderRow
    | undefined;
  if (!row) throw Object.assign(new Error("Folder not found"), { status: 404, code: "NOT_FOUND" });
  return row;
}

export async function collabFor(userId: string, itemType: "file" | "folder", itemId: string) {
  return await db
    .prepare(
      `SELECT * FROM collab_shares WHERE item_type = ? AND item_id = ? AND grantee_id = ?`
    )
    .get(itemType, itemId, userId) as
    | { id: string; permission: "viewer" | "editor"; owner_id: string }
    | undefined;
}

export async function getAccessibleFile(userId: string, fileId: string): Promise<{ file: FileRow; permission: "owner" | "viewer" | "editor" }> {
  const owned = await db.prepare("SELECT * FROM files WHERE id = ? AND user_id = ?").get(fileId, userId) as FileRow | undefined;
  if (owned) return { file: owned, permission: "owner" };
  const share = await collabFor(userId, "file", fileId);
  if (share) {
    const file = await db.prepare("SELECT * FROM files WHERE id = ?").get(fileId) as FileRow | undefined;
    if (file && !file.trashed_at) return { file, permission: share.permission };
  }
  const folderShare = await db
    .prepare(
      `SELECT cs.permission, f.* FROM collab_shares cs
       JOIN files f ON f.id = ? AND f.folder_id = cs.item_id
       WHERE cs.item_type = 'folder' AND cs.grantee_id = ?`
    )
    .get(fileId, userId) as (FileRow & { permission: "viewer" | "editor" }) | undefined;
  if (folderShare && !folderShare.trashed_at) {
    return { file: folderShare, permission: folderShare.permission };
  }
  throw Object.assign(new Error("File not found"), { status: 404, code: "NOT_FOUND" });
}

async function assertFolderOwned(userId: string, folderId: string | null) {
  if (!folderId) return;
  const folder = await db.prepare("SELECT id, trashed_at FROM folders WHERE id = ? AND user_id = ?").get(folderId, userId) as
    | { id: string; trashed_at: string | null }
    | undefined;
  if (!folder || folder.trashed_at) throw Object.assign(new Error("Folder not found"), { status: 404, code: "NOT_FOUND" });
}

export async function saveUpload(opts: {
  userId: string;
  quotaBytes: number;
  folderId: string | null;
  originalName: string;
  tempPath: string;
  claimedMime: string;
  size: number;
  ip?: string;
}): Promise<FileRow> {
  if (opts.size > config.maxUploadBytes) {
    fs.unlinkSync(opts.tempPath);
    throw Object.assign(new Error("File exceeds upload size limit"), { status: 413, code: "TOO_LARGE" });
  }
  const used = await usageBytes(opts.userId);
  if (used + opts.size > opts.quotaBytes) {
    fs.unlinkSync(opts.tempPath);
    throw Object.assign(new Error("Storage quota exceeded"), { status: 413, code: "QUOTA" });
  }
  try {
    await assertFolderOwned(opts.userId, opts.folderId);
  } catch (e) {
    fs.unlinkSync(opts.tempPath);
    throw e;
  }

  let detected = "application/octet-stream";
  try {
    const ft = await fileTypeFromFile(opts.tempPath);
    if (ft?.mime) detected = ft.mime;
    else if (opts.claimedMime.startsWith("text/")) detected = opts.claimedMime;
  } catch {
    detected = opts.claimedMime.startsWith("text/") ? opts.claimedMime : "application/octet-stream";
  }

  if (!mimeAllowed(detected) && !mimeAllowed(opts.claimedMime)) {
    fs.unlinkSync(opts.tempPath);
    throw Object.assign(new Error("File type is not allowed"), { status: 415, code: "TYPE_NOT_ALLOWED" });
  }

  const displayName = sanitizeName(opts.originalName);
  const storageName = `${randomId()}${path.extname(displayName).slice(0, 12)}`;
  const dest = storagePath(storageName);
  fs.renameSync(opts.tempPath, dest);

  const now = new Date().toISOString();
  const id = randomId();
  await db.prepare(
    `INSERT INTO files (id, user_id, folder_id, display_name, storage_name, mime_type, size_bytes, created_at, updated_at, trashed_at, description, last_opened_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)`
  ).run(id, opts.userId, opts.folderId, displayName, storageName, detected, opts.size, now, now);
  await audit(opts.userId, "file.upload", { targetType: "file", targetId: id, ip: opts.ip, detail: displayName });
  await trackActivity(opts.userId, "uploaded", { itemType: "file", itemId: id, detail: displayName });
  return await db.prepare("SELECT * FROM files WHERE id = ?").get(id) as FileRow;
}

type ListMode = "drive" | "starred" | "recent" | "trash" | "search";

export async function listDrive(userId: string, folderId: string | null, mode: ListMode, q?: string) {
  if (mode === "search" || (q && q.trim())) {
    const like = `%${(q ?? "").trim()}%`;
    const files = await db
      .prepare(
        `SELECT * FROM files WHERE user_id = ? AND trashed_at IS NULL AND display_name LIKE ? COLLATE NOCASE
         ORDER BY updated_at DESC LIMIT 200`
      )
      .all(userId, like) as FileRow[];
    const folders = await db
      .prepare(
        `SELECT * FROM folders WHERE user_id = ? AND trashed_at IS NULL AND name LIKE ? COLLATE NOCASE
         ORDER BY name COLLATE NOCASE LIMIT 100`
      )
      .all(userId, like) as FolderRow[];
    return { files, folders };
  }

  if (mode === "starred") {
    const files = await db
      .prepare(
        `SELECT f.* FROM files f
         JOIN stars s ON s.item_id = f.id AND s.item_type = 'file' AND s.user_id = ?
         WHERE f.user_id = ? AND f.trashed_at IS NULL ORDER BY s.created_at DESC`
      )
      .all(userId, userId) as FileRow[];
    const folders = await db
      .prepare(
        `SELECT fo.* FROM folders fo
         JOIN stars s ON s.item_id = fo.id AND s.item_type = 'folder' AND s.user_id = ?
         WHERE fo.user_id = ? AND fo.trashed_at IS NULL ORDER BY s.created_at DESC`
      )
      .all(userId, userId) as FolderRow[];
    return { files, folders };
  }

  if (mode === "recent") {
    const files = await db
      .prepare(
        `SELECT * FROM files WHERE user_id = ? AND trashed_at IS NULL
         ORDER BY COALESCE(last_opened_at, updated_at) DESC LIMIT 80`
      )
      .all(userId) as FileRow[];
    return { files, folders: [] as FolderRow[] };
  }

  if (mode === "trash") {
    const files = await db
      .prepare(`SELECT * FROM files WHERE user_id = ? AND trashed_at IS NOT NULL ORDER BY trashed_at DESC`)
      .all(userId) as FileRow[];
    const folders = await db
      .prepare(`SELECT * FROM folders WHERE user_id = ? AND trashed_at IS NOT NULL ORDER BY trashed_at DESC`)
      .all(userId) as FolderRow[];
    return { files, folders };
  }

  if (folderId) {
    const files = await db
      .prepare(
        `SELECT * FROM files WHERE user_id = ? AND folder_id = ? AND trashed_at IS NULL ORDER BY display_name COLLATE NOCASE`
      )
      .all(userId, folderId) as FileRow[];
    const folders = await db
      .prepare(
        `SELECT * FROM folders WHERE user_id = ? AND parent_id = ? AND trashed_at IS NULL ORDER BY name COLLATE NOCASE`
      )
      .all(userId, folderId) as FolderRow[];
    return { files, folders };
  }

  const files = await db
    .prepare(
      `SELECT * FROM files WHERE user_id = ? AND folder_id IS NULL AND trashed_at IS NULL ORDER BY display_name COLLATE NOCASE`
    )
    .all(userId) as FileRow[];
  const folders = await db
    .prepare(
      `SELECT * FROM folders WHERE user_id = ? AND parent_id IS NULL AND trashed_at IS NULL ORDER BY name COLLATE NOCASE`
    )
    .all(userId) as FolderRow[];
  return { files, folders };
}

export async function decorate(userId: string, files: FileRow[], folders: FolderRow[]) {
  const fileOut = await Promise.all(files.map(async (f) => publicFile(f, { starred: await isStarred(userId, "file", f.id), kind: "file" })));
  const folderOut = await Promise.all(folders.map(async (fo) => publicFolder(fo, { starred: await isStarred(userId, "folder", fo.id), kind: "folder" })));
  return { files: fileOut, folders: folderOut };
}

export async function renameFile(userId: string, fileId: string, name: string) {
  const file = await getOwnedFile(userId, fileId);
  const displayName = sanitizeName(name);
  await db.prepare("UPDATE files SET display_name = ?, updated_at = ? WHERE id = ? AND user_id = ?").run(
    displayName,
    new Date().toISOString(),
    file.id,
    userId
  );
  await audit(userId, "file.rename", { targetType: "file", targetId: fileId, detail: displayName });
  await trackActivity(userId, "renamed", { itemType: "file", itemId: fileId, detail: displayName });
  return await db.prepare("SELECT * FROM files WHERE id = ?").get(fileId) as FileRow;
}

export async function updateFileMeta(userId: string, fileId: string, description: string) {
  await getOwnedFile(userId, fileId);
  await db.prepare("UPDATE files SET description = ?, updated_at = ? WHERE id = ?").run(
    description.slice(0, 500),
    new Date().toISOString(),
    fileId
  );
  return await db.prepare("SELECT * FROM files WHERE id = ?").get(fileId) as FileRow;
}

export async function touchOpened(userId: string, fileId: string) {
  const { file } = await getAccessibleFile(userId, fileId);
  await db.prepare("UPDATE files SET last_opened_at = ? WHERE id = ?").run(new Date().toISOString(), file.id);
}

export async function trashFile(userId: string, fileId: string) {
  const file = await getOwnedFile(userId, fileId);
  await db.prepare("UPDATE files SET trashed_at = ?, updated_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    new Date().toISOString(),
    file.id
  );
  await audit(userId, "file.trash", { targetType: "file", targetId: fileId, detail: file.display_name });
  await trackActivity(userId, "trashed", { itemType: "file", itemId: fileId, detail: file.display_name });
}

export async function restoreFile(userId: string, fileId: string) {
  const file = await getOwnedFile(userId, fileId);
  await db.prepare("UPDATE files SET trashed_at = NULL, updated_at = ? WHERE id = ?").run(new Date().toISOString(), file.id);
  await audit(userId, "file.restore", { targetType: "file", targetId: fileId });
}

export async function purgeFile(userId: string, fileId: string) {
  const file = await getOwnedFile(userId, fileId);
  const versions = await db
    .prepare("SELECT storage_name FROM file_versions WHERE file_id = ?")
    .all(fileId) as { storage_name: string }[];
  const dest = storagePath(file.storage_name);
  await db.prepare("DELETE FROM file_versions WHERE file_id = ?").run(fileId);
  await db.prepare("DELETE FROM files WHERE id = ? AND user_id = ?").run(fileId, userId);
  await db.prepare("DELETE FROM stars WHERE item_type = 'file' AND item_id = ?").run(fileId);
  await db.prepare("DELETE FROM collab_shares WHERE item_type = 'file' AND item_id = ?").run(fileId);
  try {
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
  } catch {
    // leftover bytes cleaned by ops
  }
  for (const v of versions) {
    try {
      const p = storagePath(v.storage_name);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {
      // leftover version bytes cleaned by ops
    }
  }
  await audit(userId, "file.delete", { targetType: "file", targetId: fileId, detail: file.display_name });
}

export async function deleteFile(userId: string, fileId: string) {
  const file = await getOwnedFile(userId, fileId);
  if (!file.trashed_at) {
    await trashFile(userId, fileId);
    return { trashed: true };
  }
  await purgeFile(userId, fileId);
  return { deleted: true };
}

export async function emptyTrash(userId: string) {
  const files = await db.prepare("SELECT id FROM files WHERE user_id = ? AND trashed_at IS NOT NULL").all(userId) as {
    id: string;
  }[];
  for (const f of files) await purgeFile(userId, f.id);
  const folders = await db.prepare("SELECT id FROM folders WHERE user_id = ? AND trashed_at IS NOT NULL").all(userId) as {
    id: string;
  }[];
  for (const fo of folders) await purgeFolder(userId, fo.id);
}

export async function listFolders(userId: string, parentId: string | null) {
  if (parentId) {
    return await db
      .prepare(
        "SELECT * FROM folders WHERE user_id = ? AND parent_id = ? AND trashed_at IS NULL ORDER BY name COLLATE NOCASE"
      )
      .all(userId, parentId) as FolderRow[];
  }
  return await db
    .prepare(
      "SELECT * FROM folders WHERE user_id = ? AND parent_id IS NULL AND trashed_at IS NULL ORDER BY name COLLATE NOCASE"
    )
    .all(userId) as FolderRow[];
}

export async function createFolder(userId: string, name: string, parentId: string | null, color?: string) {
  const clean = sanitizeName(name, 80);
  if (parentId) await assertFolderOwned(userId, parentId);
  const now = new Date().toISOString();
  const id = randomId();
  await db.prepare(
    `INSERT INTO folders (id, user_id, parent_id, name, created_at, updated_at, trashed_at, color, description)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NULL)`
  ).run(id, userId, parentId, clean, now, now, color ?? null);
  await audit(userId, "folder.create", { targetType: "folder", targetId: id, detail: clean });
  await trackActivity(userId, "created folder", { itemType: "folder", itemId: id, detail: clean });
  return await db.prepare("SELECT * FROM folders WHERE id = ?").get(id) as FolderRow;
}

export async function renameFolder(userId: string, folderId: string, name: string, color?: string | null) {
  await getOwnedFolder(userId, folderId);
  const clean = sanitizeName(name, 80);
  await db.prepare("UPDATE folders SET name = ?, color = COALESCE(?, color), updated_at = ? WHERE id = ?").run(
    clean,
    color ?? null,
    new Date().toISOString(),
    folderId
  );
  return await db.prepare("SELECT * FROM folders WHERE id = ?").get(folderId) as FolderRow;
}

async function trashFolderTree(userId: string, folderId: string, at: string) {
  await db.prepare("UPDATE folders SET trashed_at = ?, updated_at = ? WHERE id = ? AND user_id = ?").run(
    at,
    at,
    folderId,
    userId
  );
  await db.prepare("UPDATE files SET trashed_at = ?, updated_at = ? WHERE folder_id = ? AND user_id = ? AND trashed_at IS NULL").run(
    at,
    at,
    folderId,
    userId
  );
  const children = await db
    .prepare("SELECT id FROM folders WHERE user_id = ? AND parent_id = ? AND trashed_at IS NULL")
    .all(userId, folderId) as { id: string }[];
  for (const c of children) await trashFolderTree(userId, c.id, at);
}

export async function trashFolder(userId: string, folderId: string) {
  await getOwnedFolder(userId, folderId);
  await trashFolderTree(userId, folderId, new Date().toISOString());
  await audit(userId, "folder.trash", { targetType: "folder", targetId: folderId });
}

export async function restoreFolder(userId: string, folderId: string) {
  await getOwnedFolder(userId, folderId);
  await db.prepare("UPDATE folders SET trashed_at = NULL, updated_at = ? WHERE id = ?").run(new Date().toISOString(), folderId);
  await db.prepare("UPDATE files SET trashed_at = NULL, updated_at = ? WHERE folder_id = ? AND user_id = ?").run(
    new Date().toISOString(),
    folderId,
    userId
  );
}

async function purgeFolder(userId: string, folderId: string) {
  const files = await db.prepare("SELECT id FROM files WHERE user_id = ? AND folder_id = ?").all(userId, folderId) as {
    id: string;
  }[];
  for (const f of files) await purgeFile(userId, f.id);
  const children = await db.prepare("SELECT id FROM folders WHERE user_id = ? AND parent_id = ?").all(userId, folderId) as {
    id: string;
  }[];
  for (const c of children) await purgeFolder(userId, c.id);
  await db.prepare("DELETE FROM stars WHERE item_type = 'folder' AND item_id = ?").run(folderId);
  await db.prepare("DELETE FROM collab_shares WHERE item_type = 'folder' AND item_id = ?").run(folderId);
  await db.prepare("DELETE FROM folders WHERE id = ? AND user_id = ?").run(folderId, userId);
}

export async function deleteFolder(userId: string, folderId: string) {
  const folder = await getOwnedFolder(userId, folderId);
  if (!folder.trashed_at) {
    await trashFolder(userId, folderId);
    return { trashed: true };
  }
  await purgeFolder(userId, folderId);
  await audit(userId, "folder.delete", { targetType: "folder", targetId: folderId });
  return { deleted: true };
}

async function wouldCycle(userId: string, folderId: string, newParentId: string | null): Promise<boolean> {
  if (!newParentId) return false;
  if (folderId === newParentId) return true;
  let cur: string | null = newParentId;
  const seen = new Set<string>();
  while (cur) {
    if (cur === folderId) return true;
    if (seen.has(cur)) return true;
    seen.add(cur);
    const row = await db.prepare("SELECT parent_id FROM folders WHERE id = ? AND user_id = ?").get(cur, userId) as
      | { parent_id: string | null }
      | undefined;
    cur = row?.parent_id ?? null;
  }
  return false;
}

export async function moveFile(userId: string, fileId: string, folderId: string | null) {
  await getOwnedFile(userId, fileId);
  await assertFolderOwned(userId, folderId);
  await db.prepare("UPDATE files SET folder_id = ?, updated_at = ? WHERE id = ?").run(
    folderId,
    new Date().toISOString(),
    fileId
  );
  await trackActivity(userId, "moved", { itemType: "file", itemId: fileId });
  return await db.prepare("SELECT * FROM files WHERE id = ?").get(fileId) as FileRow;
}

export async function moveFolder(userId: string, folderId: string, parentId: string | null) {
  await getOwnedFolder(userId, folderId);
  await assertFolderOwned(userId, parentId);
  if (await wouldCycle(userId, folderId, parentId)) {
    throw Object.assign(new Error("Cannot move a folder into itself"), { status: 400, code: "CYCLE" });
  }
  await db.prepare("UPDATE folders SET parent_id = ?, updated_at = ? WHERE id = ?").run(
    parentId,
    new Date().toISOString(),
    folderId
  );
  return await db.prepare("SELECT * FROM folders WHERE id = ?").get(folderId) as FolderRow;
}

export async function copyFile(userId: string, fileId: string, quotaBytes: number, folderId: string | null) {
  const src = await getOwnedFile(userId, fileId);
  if (src.trashed_at) throw Object.assign(new Error("Cannot copy a trashed file"), { status: 400 });
  await assertFolderOwned(userId, folderId);
  const used = await usageBytes(userId);
  if (used + src.size_bytes > quotaBytes) {
    throw Object.assign(new Error("Storage quota exceeded"), { status: 413, code: "QUOTA" });
  }
  const storageName = `${randomId()}${path.extname(src.storage_name).slice(0, 12)}`;
  fs.copyFileSync(storagePath(src.storage_name), storagePath(storageName));
  const now = new Date().toISOString();
  const id = randomId();
  const name = src.display_name.replace(/(\.[^.]+)?$/, (ext) => ` copy${ext ?? ""}`);
  await db.prepare(
    `INSERT INTO files (id, user_id, folder_id, display_name, storage_name, mime_type, size_bytes, created_at, updated_at, trashed_at, description, last_opened_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL)`
  ).run(id, userId, folderId ?? src.folder_id, name, storageName, src.mime_type, src.size_bytes, now, now, src.description);
  await trackActivity(userId, "copied", { itemType: "file", itemId: id, detail: name });
  return await db.prepare("SELECT * FROM files WHERE id = ?").get(id) as FileRow;
}

export async function setStar(userId: string, itemType: "file" | "folder", itemId: string, starred: boolean) {
  if (itemType === "file") await getOwnedFile(userId, itemId);
  else await getOwnedFolder(userId, itemId);
  if (starred) {
    await db.prepare(
      `INSERT OR IGNORE INTO stars (user_id, item_type, item_id, created_at) VALUES (?, ?, ?, ?)`
    ).run(userId, itemType, itemId, new Date().toISOString());
  } else {
    await db.prepare("DELETE FROM stars WHERE user_id = ? AND item_type = ? AND item_id = ?").run(userId, itemType, itemId);
  }
  return { starred };
}

export async function addCollab(ownerId: string, itemType: "file" | "folder", itemId: string, email: string, permission: "viewer" | "editor") {
  if (itemType === "file") await getOwnedFile(ownerId, itemId);
  else await getOwnedFolder(ownerId, itemId);
  const grantee = await db.prepare("SELECT id, email, display_name FROM users WHERE email = ? AND status = 'active'").get(
    email.toLowerCase()
  ) as { id: string; email: string; display_name: string } | undefined;
  if (!grantee) throw Object.assign(new Error("No active user with that email"), { status: 404, code: "USER_NOT_FOUND" });
  if (grantee.id === ownerId) throw Object.assign(new Error("You already own this item"), { status: 400 });
  const id = randomId();
  await db.prepare(
    `INSERT INTO collab_shares (id, owner_id, item_type, item_id, grantee_id, permission, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(item_type, item_id, grantee_id) DO UPDATE SET permission = excluded.permission`
  ).run(id, ownerId, itemType, itemId, grantee.id, permission, new Date().toISOString());
  await audit(ownerId, "collab.add", { targetType: itemType, targetId: itemId, detail: email });
  return { email: grantee.email, displayName: grantee.display_name, permission };
}

export async function listCollab(ownerId: string, itemType: "file" | "folder", itemId: string) {
  if (itemType === "file") await getOwnedFile(ownerId, itemId);
  else await getOwnedFolder(ownerId, itemId);
  return await db
    .prepare(
      `SELECT cs.id, cs.permission, cs.created_at, u.email, u.display_name
       FROM collab_shares cs JOIN users u ON u.id = cs.grantee_id
       WHERE cs.item_type = ? AND cs.item_id = ?`
    )
    .all(itemType, itemId);
}

export async function removeCollab(ownerId: string, shareId: string) {
  const row = await db.prepare("SELECT * FROM collab_shares WHERE id = ? AND owner_id = ?").get(shareId, ownerId);
  if (!row) throw Object.assign(new Error("Share not found"), { status: 404, code: "NOT_FOUND" });
  await db.prepare("DELETE FROM collab_shares WHERE id = ?").run(shareId);
}

export async function sharedWithMe(userId: string) {
  const files = await db
    .prepare(
      `SELECT f.*, cs.permission, u.display_name AS owner_name, u.email AS owner_email
       FROM collab_shares cs
       JOIN files f ON f.id = cs.item_id
       JOIN users u ON u.id = cs.owner_id
       WHERE cs.grantee_id = ? AND cs.item_type = 'file' AND f.trashed_at IS NULL
       ORDER BY cs.created_at DESC`
    )
    .all(userId) as (FileRow & { permission: string; owner_name: string; owner_email: string })[];
  const folders = await db
    .prepare(
      `SELECT fo.*, cs.permission, u.display_name AS owner_name, u.email AS owner_email
       FROM collab_shares cs
       JOIN folders fo ON fo.id = cs.item_id
       JOIN users u ON u.id = cs.owner_id
       WHERE cs.grantee_id = ? AND cs.item_type = 'folder' AND fo.trashed_at IS NULL
       ORDER BY cs.created_at DESC`
    )
    .all(userId) as (FolderRow & { permission: string; owner_name: string; owner_email: string })[];
  const fileOut = await Promise.all(files.map(async (f) =>
      publicFile(f, {
        permission: f.permission,
        ownerName: f.owner_name,
        ownerEmail: f.owner_email,
        kind: "file",
        starred: await isStarred(userId, "file", f.id),
      })
    ));
  const folderOut = await Promise.all(folders.map(async (fo) =>
      publicFolder(fo, {
        permission: fo.permission,
        ownerName: fo.owner_name,
        ownerEmail: fo.owner_email,
        kind: "folder",
        starred: await isStarred(userId, "folder", fo.id),
      })
    ));
  return { files: fileOut, folders: folderOut };
}

export async function recentActivity(userId: string, limit = 30) {
  return await db
    .prepare(`SELECT * FROM activity WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`)
    .all(userId, limit);
}

export async function storageBreakdown(userId: string) {
  const rows = await db
    .prepare(
      `SELECT
         CASE
           WHEN mime_type LIKE 'image/%' THEN 'Images'
           WHEN mime_type LIKE 'video/%' THEN 'Videos'
           WHEN mime_type LIKE 'audio/%' THEN 'Audio'
           WHEN mime_type LIKE 'text/%' OR mime_type = 'application/pdf' OR mime_type LIKE 'application/json%' THEN 'Documents'
           WHEN mime_type LIKE 'application/zip%' OR mime_type LIKE 'application/vnd.%' THEN 'Archives'
           ELSE 'Other'
         END AS category,
         COUNT(*) AS count,
         COALESCE(SUM(size_bytes), 0) AS bytes
        FROM files WHERE user_id = ? AND trashed_at IS NULL
        GROUP BY 1`
    )
    .all(userId) as { category: string; count: number; bytes: number }[];
  return rows;
}

export async function folderTree(userId: string) {
  return await db
    .prepare(
      `SELECT id, parent_id, name FROM folders WHERE user_id = ? AND trashed_at IS NULL ORDER BY name COLLATE NOCASE`
    )
    .all(userId) as { id: string; parent_id: string | null; name: string }[];
}

const MAX_VERSIONS = 20;

async function detectMime(tempPath: string, claimedMime: string): Promise<string> {
  try {
    const ft = await fileTypeFromFile(tempPath);
    if (ft?.mime) return ft.mime;
    if (claimedMime.startsWith("text/")) return claimedMime;
  } catch {
    if (claimedMime.startsWith("text/")) return claimedMime;
  }
  return claimedMime || "application/octet-stream";
}

async function nextVersionNumber(fileId: string): Promise<number> {
  const row = await db
    .prepare("SELECT COALESCE(MAX(version_number), 0) AS n FROM file_versions WHERE file_id = ?")
    .get(fileId) as { n: number };
  return Number(row.n) + 1;
}

async function pruneOldVersions(fileId: string) {
  const extras = await db
    .prepare(
      `SELECT id, storage_name FROM file_versions WHERE file_id = ?
       ORDER BY version_number DESC OFFSET ?`
    )
    .all(fileId, MAX_VERSIONS) as { id: string; storage_name: string }[];
  for (const v of extras) {
    await db.prepare("DELETE FROM file_versions WHERE id = ?").run(v.id);
    try {
      const p = storagePath(v.storage_name);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {
      // leftover version bytes cleaned by ops
    }
  }
}

async function snapshotCurrent(file: FileRow, actorId: string) {
  const src = storagePath(file.storage_name);
  if (!fs.existsSync(src)) return;
  const versionNumber = await nextVersionNumber(file.id);
  const storageName = `${randomId()}${path.extname(file.storage_name).slice(0, 12)}`;
  fs.copyFileSync(src, storagePath(storageName));
  await db
    .prepare(
      `INSERT INTO file_versions (id, file_id, version_number, storage_name, mime_type, size_bytes, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      randomId(),
      file.id,
      versionNumber,
      storageName,
      file.mime_type,
      file.size_bytes,
      actorId,
      new Date().toISOString()
    );
  await pruneOldVersions(file.id);
}

export async function listVersions(userId: string, fileId: string) {
  const { file } = await getAccessibleFile(userId, fileId);
  const rows = await db
    .prepare("SELECT * FROM file_versions WHERE file_id = ? ORDER BY version_number DESC")
    .all(file.id) as FileVersionRow[];
  return {
    current: publicFile(file, { kind: "file" }),
    versions: rows.map(publicVersion),
  };
}

export async function getVersion(userId: string, fileId: string, versionId: string) {
  const { file } = await getAccessibleFile(userId, fileId);
  const row = await db
    .prepare("SELECT * FROM file_versions WHERE id = ? AND file_id = ?")
    .get(versionId, file.id) as FileVersionRow | undefined;
  if (!row) throw Object.assign(new Error("Version not found"), { status: 404, code: "NOT_FOUND" });
  return { file, version: row };
}

export async function replaceFile(opts: {
  userId: string;
  quotaBytes: number;
  fileId: string;
  originalName?: string;
  tempPath: string;
  claimedMime: string;
  size: number;
  ip?: string;
}): Promise<FileRow> {
  const access = await getAccessibleFile(opts.userId, opts.fileId);
  if (access.permission === "viewer") {
    fs.unlinkSync(opts.tempPath);
    throw Object.assign(new Error("Editor or owner access required"), { status: 403, code: "FORBIDDEN" });
  }
  const file = access.file;
  if (file.trashed_at) {
    fs.unlinkSync(opts.tempPath);
    throw Object.assign(new Error("Cannot replace a trashed file"), { status: 400 });
  }
  if (opts.size > config.maxUploadBytes) {
    fs.unlinkSync(opts.tempPath);
    throw Object.assign(new Error("File exceeds upload size limit"), { status: 413, code: "TOO_LARGE" });
  }

  const owner = await db.prepare("SELECT quota_bytes FROM users WHERE id = ?").get(file.user_id) as
    | { quota_bytes: number }
    | undefined;
  const used = await usageBytes(file.user_id);
  const cap = file.user_id === opts.userId ? opts.quotaBytes : Number(owner?.quota_bytes ?? 0);
  if (used + opts.size > cap) {
    fs.unlinkSync(opts.tempPath);
    throw Object.assign(new Error("Storage quota exceeded"), { status: 413, code: "QUOTA" });
  }

  const detected = await detectMime(opts.tempPath, opts.claimedMime);
  if (!mimeAllowed(detected) && !mimeAllowed(opts.claimedMime)) {
    fs.unlinkSync(opts.tempPath);
    throw Object.assign(new Error("File type is not allowed"), { status: 415, code: "TYPE_NOT_ALLOWED" });
  }

  await snapshotCurrent(file, opts.userId);

  const displayName = opts.originalName ? sanitizeName(opts.originalName) : file.display_name;
  const storageName = `${randomId()}${path.extname(displayName).slice(0, 12)}`;
  const dest = storagePath(storageName);
  fs.renameSync(opts.tempPath, dest);

  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE files SET display_name = ?, storage_name = ?, mime_type = ?, size_bytes = ?, updated_at = ? WHERE id = ?`
    )
    .run(displayName, storageName, detected, opts.size, now, file.id);
  try {
    const prev = storagePath(file.storage_name);
    if (fs.existsSync(prev)) fs.unlinkSync(prev);
  } catch {
    // leftover current bytes cleaned by ops
  }

  await audit(opts.userId, "file.replace", { targetType: "file", targetId: file.id, ip: opts.ip, detail: displayName });
  await trackActivity(opts.userId, "replaced", { itemType: "file", itemId: file.id, detail: displayName });
  return await db.prepare("SELECT * FROM files WHERE id = ?").get(file.id) as FileRow;
}

export async function restoreVersion(userId: string, quotaBytes: number, fileId: string, versionId: string) {
  const { file, version } = await getVersion(userId, fileId, versionId);
  const access = await getAccessibleFile(userId, fileId);
  if (access.permission === "viewer") {
    throw Object.assign(new Error("Editor or owner access required"), { status: 403, code: "FORBIDDEN" });
  }
  if (file.trashed_at) throw Object.assign(new Error("Cannot restore a version of a trashed file"), { status: 400 });

  const src = storagePath(version.storage_name);
  if (!fs.existsSync(src)) throw Object.assign(new Error("Version data missing"), { status: 404, code: "NOT_FOUND" });

  const owner = await db.prepare("SELECT quota_bytes FROM users WHERE id = ?").get(file.user_id) as
    | { quota_bytes: number }
    | undefined;
  const used = await usageBytes(file.user_id);
  const cap = file.user_id === userId ? quotaBytes : Number(owner?.quota_bytes ?? 0);
  if (owner && used + version.size_bytes > cap) {
    throw Object.assign(new Error("Storage quota exceeded"), { status: 413, code: "QUOTA" });
  }

  await snapshotCurrent(file, userId);

  const storageName = `${randomId()}${path.extname(version.storage_name).slice(0, 12)}`;
  fs.copyFileSync(src, storagePath(storageName));
  const now = new Date().toISOString();
  await db
    .prepare(`UPDATE files SET storage_name = ?, mime_type = ?, size_bytes = ?, updated_at = ? WHERE id = ?`)
    .run(storageName, version.mime_type, version.size_bytes, now, file.id);
  try {
    const prev = storagePath(file.storage_name);
    if (fs.existsSync(prev)) fs.unlinkSync(prev);
  } catch {
    // leftover current bytes cleaned by ops
  }

  await audit(userId, "file.version.restore", {
    targetType: "file",
    targetId: file.id,
    detail: `v${version.version_number}`,
  });
  await trackActivity(userId, "restored version", {
    itemType: "file",
    itemId: file.id,
    detail: `v${version.version_number}`,
  });
  return await db.prepare("SELECT * FROM files WHERE id = ?").get(file.id) as FileRow;
}
