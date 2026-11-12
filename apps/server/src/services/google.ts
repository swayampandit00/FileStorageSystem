import fs from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { audit, db, trackActivity } from "../db.js";
import { randomId } from "../utils/crypto.js";
import { decryptSecret, encryptSecret } from "../utils/secret.js";
import { createFolder, saveUpload, sanitizeName, type FileRow, type FolderRow } from "./files.js";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly email";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const MAX_IMPORT_FILES = 200;
const MAX_DEPTH = 8;

const EXPORT_MAP: Record<string, { mime: string; ext: string }> = {
  "application/vnd.google-apps.document": {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ext: ".docx",
  },
  "application/vnd.google-apps.spreadsheet": {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ext: ".xlsx",
  },
  "application/vnd.google-apps.presentation": {
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ext: ".pptx",
  },
  "application/vnd.google-apps.drawing": { mime: "application/pdf", ext: ".pdf" },
};

export type GoogleItem = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  isFolder: boolean;
};

type GoogleAccount = {
  user_id: string;
  google_email: string | null;
  access_token_enc: string;
  refresh_token_enc: string;
  token_expiry: string;
  scope: string | null;
};

export function googleConfigured(): boolean {
  return Boolean(config.googleClientId && config.googleClientSecret);
}

export function googleRedirectUri(): string {
  return config.googleRedirectUri || `${config.webOrigin.replace(/\/$/, "")}/api/google/callback`;
}

export function connectUrl(userId: string): string {
  if (!googleConfigured()) {
    throw Object.assign(new Error("Google Drive is not configured on this server"), {
      status: 400,
      code: "GOOGLE_NOT_CONFIGURED",
    });
  }
  const state = jwt.sign({ sub: userId, typ: "gdrive" }, config.jwtAccessSecret, { expiresIn: "10m" });
  const params = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: DRIVE_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function parseOAuthState(state: string): string {
  const payload = jwt.verify(state, config.jwtAccessSecret) as { sub: string; typ: string };
  if (payload.typ !== "gdrive" || !payload.sub) {
    throw Object.assign(new Error("Invalid Google sign-in state"), { status: 400, code: "GOOGLE_STATE" });
  }
  return payload.sub;
}

export async function statusFor(userId: string) {
  const row = await db.prepare("SELECT google_email FROM google_accounts WHERE user_id = ?").get<{
    google_email: string | null;
  }>(userId);
  return {
    configured: googleConfigured(),
    connected: Boolean(row),
    email: row?.google_email ?? null,
  };
}

export async function saveTokens(userId: string, tokens: {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}, email: string | null) {
  const now = new Date();
  const expiry = new Date(now.getTime() + Math.max(60, Number(tokens.expires_in ?? 3600) - 60) * 1000);
  const existing = await db.prepare("SELECT refresh_token_enc FROM google_accounts WHERE user_id = ?").get<{
    refresh_token_enc: string;
  }>(userId);
  const refreshEnc = tokens.refresh_token
    ? encryptSecret(tokens.refresh_token)
    : existing?.refresh_token_enc;
  if (!refreshEnc) {
    throw Object.assign(new Error("Google did not return a refresh token. Reconnect and allow offline access."), {
      status: 400,
      code: "GOOGLE_NO_REFRESH",
    });
  }
  if (existing) {
    await db.prepare(
      `UPDATE google_accounts SET google_email = ?, access_token_enc = ?, refresh_token_enc = ?, token_expiry = ?, scope = ?, updated_at = ? WHERE user_id = ?`
    ).run(
      email,
      encryptSecret(tokens.access_token),
      refreshEnc,
      expiry.toISOString(),
      tokens.scope ?? DRIVE_SCOPE,
      now.toISOString(),
      userId
    );
  } else {
    await db.prepare(
      `INSERT INTO google_accounts (user_id, google_email, access_token_enc, refresh_token_enc, token_expiry, scope, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      userId,
      email,
      encryptSecret(tokens.access_token),
      refreshEnc,
      expiry.toISOString(),
      tokens.scope ?? DRIVE_SCOPE,
      now.toISOString(),
      now.toISOString()
    );
  }
}

export async function exchangeCode(code: string) {
  const body = new URLSearchParams({
    code,
    client_id: config.googleClientId,
    client_secret: config.googleClientSecret,
    redirect_uri: googleRedirectUri(),
    grant_type: "authorization_code",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw Object.assign(new Error(json.error_description || json.error || "Google token exchange failed"), {
      status: 400,
      code: "GOOGLE_TOKEN",
    });
  }
  return json as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };
}

async function googleEmail(accessToken: string): Promise<string | null> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { email?: string };
  return json.email ?? null;
}

export async function finishOAuth(userId: string, code: string) {
  const tokens = await exchangeCode(code);
  const email = await googleEmail(tokens.access_token);
  await saveTokens(userId, tokens, email);
  await audit(userId, "google.connect", { targetType: "google", detail: email ?? undefined });
}

async function loadAccount(userId: string): Promise<GoogleAccount> {
  const row = await db.prepare("SELECT * FROM google_accounts WHERE user_id = ?").get<GoogleAccount>(userId);
  if (!row) {
    throw Object.assign(new Error("Connect Google Drive first"), { status: 400, code: "GOOGLE_NOT_CONNECTED" });
  }
  return row;
}

async function accessToken(userId: string): Promise<string> {
  const row = await loadAccount(userId);
  if (new Date(row.token_expiry).getTime() > Date.now() + 15_000) {
    return decryptSecret(row.access_token_enc);
  }
  const refresh = decryptSecret(row.refresh_token_enc);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
  });
  const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !json.access_token) {
    throw Object.assign(new Error("Google access expired. Reconnect Drive."), {
      status: 401,
      code: "GOOGLE_RECONNECT",
    });
  }
  await saveTokens(userId, { access_token: json.access_token, expires_in: json.expires_in }, row.google_email);
  return json.access_token;
}

async function driveGet(userId: string, url: string) {
  const token = await accessToken(userId);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return res;
}

export async function listGoogleFiles(userId: string, parentId: string, pageToken?: string) {
  const parent = parentId || "root";
  const q = `'${parent.replace(/'/g, "\\'")}' in parents and trashed = false`;
  const params = new URLSearchParams({
    q,
    pageSize: "100",
    orderBy: "folder,name",
    fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime)",
    supportsAllDrives: "false",
  });
  if (pageToken) params.set("pageToken", pageToken);
  const res = await driveGet(userId, `https://www.googleapis.com/drive/v3/files?${params.toString()}`);
  const json = (await res.json()) as {
    files?: { id: string; name: string; mimeType: string; size?: string; modifiedTime?: string }[];
    nextPageToken?: string;
    error?: { message?: string };
  };
  if (!res.ok) {
    throw Object.assign(new Error(json.error?.message || "Could not list Google Drive"), {
      status: 400,
      code: "GOOGLE_LIST",
    });
  }
  const files: GoogleItem[] = (json.files ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    size: f.size,
    modifiedTime: f.modifiedTime,
    isFolder: f.mimeType === FOLDER_MIME,
  }));
  return { files, nextPageToken: json.nextPageToken ?? null, parentId: parent };
}

export async function disconnect(userId: string) {
  const row = await db.prepare("SELECT access_token_enc FROM google_accounts WHERE user_id = ?").get<{
    access_token_enc: string;
  }>(userId);
  if (row) {
    try {
      const token = decryptSecret(row.access_token_enc);
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" });
    } catch {
      // ignore revoke failures
    }
  }
  await db.prepare("DELETE FROM google_accounts WHERE user_id = ?").run(userId);
  await audit(userId, "google.disconnect", { targetType: "google" });
}

async function downloadGoogleFile(
  userId: string,
  fileId: string,
  mimeType: string
): Promise<{ buffer: Buffer; mime: string; ext: string }> {
  const exportTo = EXPORT_MAP[mimeType];
  const token = await accessToken(userId);
  let url: string;
  let mime: string;
  let ext = "";
  if (exportTo) {
    url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(exportTo.mime)}`;
    mime = exportTo.mime;
    ext = exportTo.ext;
  } else if (mimeType.startsWith("application/vnd.google-apps.")) {
    throw Object.assign(new Error("This Google file type cannot be downloaded"), { status: 415, code: "GOOGLE_EXPORT" });
  } else {
    url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
    mime = mimeType || "application/octet-stream";
  }
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw Object.assign(new Error(text.slice(0, 180) || "Google download failed"), {
      status: 400,
      code: "GOOGLE_DOWNLOAD",
    });
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return { buffer: buf, mime, ext };
}

async function saveBuffer(opts: {
  userId: string;
  quotaBytes: number;
  folderId: string | null;
  originalName: string;
  buffer: Buffer;
  mime: string;
  ip?: string;
}): Promise<FileRow> {
  const tmpDir = path.join(config.storageDir, ".tmp");
  fs.mkdirSync(tmpDir, { recursive: true });
  const tempPath = path.join(tmpDir, randomId());
  fs.writeFileSync(tempPath, opts.buffer);
  return saveUpload({
    userId: opts.userId,
    quotaBytes: opts.quotaBytes,
    folderId: opts.folderId,
    originalName: opts.originalName,
    tempPath,
    claimedMime: opts.mime,
    size: opts.buffer.length,
    ip: opts.ip,
  });
}

type ImportResult = {
  imported: number;
  folders: number;
  skipped: { name: string; reason: string }[];
};

async function importOneFile(
  userId: string,
  quotaBytes: number,
  folderId: string | null,
  item: GoogleItem,
  result: ImportResult,
  ip?: string
) {
  if (result.imported >= MAX_IMPORT_FILES) {
    result.skipped.push({ name: item.name, reason: "Import limit reached" });
    return;
  }
  try {
    const { buffer, mime, ext } = await downloadGoogleFile(userId, item.id, item.mimeType);
    if (buffer.length > config.maxUploadBytes) {
      result.skipped.push({ name: item.name, reason: "File exceeds upload size limit" });
      return;
    }
    let name = sanitizeName(item.name);
    if (ext && !name.toLowerCase().endsWith(ext)) name += ext;
    await saveBuffer({ userId, quotaBytes, folderId, originalName: name, buffer, mime, ip });
    result.imported += 1;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Import failed";
    result.skipped.push({ name: item.name, reason: msg });
  }
}

async function importFolder(
  userId: string,
  quotaBytes: number,
  destFolderId: string | null,
  googleFolder: GoogleItem,
  result: ImportResult,
  depth: number,
  ip?: string
) {
  if (depth > MAX_DEPTH) {
    result.skipped.push({ name: googleFolder.name, reason: "Folder too deep" });
    return;
  }
  const created: FolderRow = await createFolder(userId, googleFolder.name, destFolderId);
  result.folders += 1;
  let page: string | null = null;
  do {
    const listed = await listGoogleFiles(userId, googleFolder.id, page ?? undefined);
    for (const child of listed.files) {
      if (child.isFolder) {
        await importFolder(userId, quotaBytes, created.id, child, result, depth + 1, ip);
      } else {
        await importOneFile(userId, quotaBytes, created.id, child, result, ip);
      }
      if (result.imported >= MAX_IMPORT_FILES) return;
    }
    page = listed.nextPageToken;
  } while (page);
}

export async function importGoogleItems(opts: {
  userId: string;
  quotaBytes: number;
  destFolderId: string | null;
  items: { id: string; name?: string; mimeType?: string }[];
  ip?: string;
}): Promise<ImportResult> {
  if (!opts.items.length) {
    throw Object.assign(new Error("Select at least one file or folder"), { status: 400 });
  }
  if (opts.items.length > 50) {
    throw Object.assign(new Error("Select at most 50 items at a time"), { status: 400 });
  }
  const result: ImportResult = { imported: 0, folders: 0, skipped: [] };
  for (const raw of opts.items) {
    const metaRes = await driveGet(
      opts.userId,
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(raw.id)}?fields=id,name,mimeType,size`
    );
    const meta = (await metaRes.json()) as {
      id?: string;
      name?: string;
      mimeType?: string;
      size?: string;
      error?: { message?: string };
    };
    if (!metaRes.ok || !meta.id || !meta.name || !meta.mimeType) {
      result.skipped.push({ name: raw.name || raw.id, reason: meta.error?.message || "Not found on Google Drive" });
      continue;
    }
    const item: GoogleItem = {
      id: meta.id,
      name: meta.name,
      mimeType: meta.mimeType,
      size: meta.size,
      isFolder: meta.mimeType === FOLDER_MIME,
    };
    if (item.isFolder) {
      await importFolder(opts.userId, opts.quotaBytes, opts.destFolderId, item, result, 0, opts.ip);
    } else {
      await importOneFile(opts.userId, opts.quotaBytes, opts.destFolderId, item, result, opts.ip);
    }
    if (result.imported >= MAX_IMPORT_FILES) break;
  }
  await trackActivity(opts.userId, "imported from Google Drive", {
    detail: `${result.imported} files, ${result.folders} folders`,
  });
  await audit(opts.userId, "google.import", {
    targetType: "google",
    ip: opts.ip,
    detail: `${result.imported} files, ${result.folders} folders`,
  });
  return result;
}
