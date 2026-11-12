import { audit, db } from "../db.js";
import { hashPassword, randomId, sha256, verifyPassword } from "../utils/crypto.js";
import { getOwnedFile, publicFile, type FileRow } from "./files.js";

export type ShareRow = {
  id: string;
  file_id: string;
  user_id: string;
  token_hash: string;
  password_hash: string | null;
  expires_at: string | null;
  max_downloads: number | null;
  download_count: number;
  revoked_at: string | null;
  created_at: string;
};

export function publicShare(row: ShareRow, token?: string) {
  return {
    id: row.id,
    fileId: row.file_id,
    token: token ?? undefined,
    hasPassword: Boolean(row.password_hash),
    expiresAt: row.expires_at,
    maxDownloads: row.max_downloads,
    downloadCount: Number(row.download_count),
    revoked: Boolean(row.revoked_at),
    createdAt: row.created_at,
  };
}

export async function createShare(opts: {
  userId: string;
  fileId: string;
  password?: string;
  expiresAt?: string | null;
  maxDownloads?: number | null;
}) {
  const file = await getOwnedFile(opts.userId, opts.fileId);
  const rawToken = randomId() + randomId();
  const now = new Date().toISOString();
  let passwordHash: string | null = null;
  if (opts.password) passwordHash = await hashPassword(opts.password);
  const id = randomId();
  await db.prepare(
    `INSERT INTO shares (id, file_id, user_id, token_hash, password_hash, expires_at, max_downloads, download_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`
  ).run(
    id,
    file.id,
    opts.userId,
    sha256(rawToken),
    passwordHash,
    opts.expiresAt ?? null,
    opts.maxDownloads ?? null,
    now
  );
  await audit(opts.userId, "share.create", { targetType: "share", targetId: id, detail: file.id });
  const row = await db.prepare("SELECT * FROM shares WHERE id = ?").get<ShareRow>(id);
  if (!row) throw new Error("Failed to create share");
  return { share: publicShare(row, rawToken), file: publicFile(file) };
}

export async function listShares(userId: string) {
  const rows = await db
    .prepare(
      `SELECT s.*, f.display_name, f.size_bytes, f.mime_type
       FROM shares s JOIN files f ON f.id = s.file_id
       WHERE s.user_id = ? ORDER BY s.created_at DESC`
    )
    .all<ShareRow & { display_name: string; size_bytes: number; mime_type: string }>(userId);
  return rows.map((r) => ({
    ...publicShare(r),
    fileName: r.display_name,
    sizeBytes: Number(r.size_bytes),
    mimeType: r.mime_type,
  }));
}

export async function revokeShare(userId: string, shareId: string) {
  const row = await db.prepare("SELECT * FROM shares WHERE id = ? AND user_id = ?").get<ShareRow>(shareId, userId);
  if (!row) throw Object.assign(new Error("Share not found"), { status: 404, code: "NOT_FOUND" });
  await db.prepare("UPDATE shares SET revoked_at = ? WHERE id = ?").run(new Date().toISOString(), shareId);
  await audit(userId, "share.revoke", { targetType: "share", targetId: shareId });
}

export async function resolveShare(token: string, password?: string): Promise<{ share: ShareRow; file: FileRow }> {
  const row = await db.prepare("SELECT * FROM shares WHERE token_hash = ?").get<ShareRow>(sha256(token));
  if (!row || row.revoked_at) {
    throw Object.assign(new Error("Share link is invalid or revoked"), { status: 404, code: "SHARE_INVALID" });
  }
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    throw Object.assign(new Error("Share link has expired"), { status: 410, code: "SHARE_EXPIRED" });
  }
  if (row.max_downloads != null && Number(row.download_count) >= Number(row.max_downloads)) {
    throw Object.assign(new Error("Share download limit reached"), { status: 410, code: "SHARE_LIMIT" });
  }
  if (row.password_hash) {
    if (!password) throw Object.assign(new Error("Password required"), { status: 401, code: "SHARE_PASSWORD" });
    const ok = await verifyPassword(password, row.password_hash);
    if (!ok) throw Object.assign(new Error("Incorrect share password"), { status: 401, code: "SHARE_PASSWORD" });
  }
  const file = await db.prepare("SELECT * FROM files WHERE id = ?").get<FileRow>(row.file_id);
  if (!file) throw Object.assign(new Error("File no longer exists"), { status: 404, code: "NOT_FOUND" });
  return { share: row, file };
}

export async function bumpDownload(shareId: string) {
  await db.prepare("UPDATE shares SET download_count = download_count + 1 WHERE id = ?").run(shareId);
}
