export type ApiError = { message: string; code?: string };

export type User = {
  id: string;
  email: string;
  displayName: string;
  role: "user" | "admin";
  status: "active" | "disabled";
  quotaBytes: number;
  createdAt: string;
};

export type CloudFile = {
  id: string;
  ownerId?: string;
  folderId: string | null;
  displayName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
  trashedAt?: string | null;
  description?: string | null;
  lastOpenedAt?: string | null;
  starred?: boolean;
  kind?: "file";
  permission?: string;
  ownerName?: string;
  ownerEmail?: string;
};

export type Folder = {
  id: string;
  ownerId?: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt?: string;
  trashedAt?: string | null;
  color?: string | null;
  description?: string | null;
  starred?: boolean;
  kind?: "folder";
  permission?: string;
  ownerName?: string;
  ownerEmail?: string;
};

export type ShareItem = {
  id: string;
  fileId: string;
  token?: string;
  hasPassword: boolean;
  expiresAt: string | null;
  maxDownloads: number | null;
  downloadCount: number;
  revoked: boolean;
  createdAt: string;
  fileName?: string;
  sizeBytes?: number;
  mimeType?: string;
};

export type Usage = {
  usedBytes: number;
  quotaBytes: number;
  remainingBytes: number;
  breakdown?: { category: string; count: number; bytes: number }[];
};

export type Activity = {
  id: string;
  action: string;
  item_type: string | null;
  item_id: string | null;
  detail: string | null;
  created_at: string;
};

export type FolderNode = { id: string; parent_id: string | null; name: string };

export type FileVersion = {
  id: string;
  fileId: string;
  versionNumber: number;
  mimeType: string;
  sizeBytes: number;
  createdBy: string | null;
  createdAt: string;
};

type Envelope<T> = { ok: true; data: T } | { ok: false; error: ApiError };

let accessToken: string | null = sessionStorage.getItem("mc_access");
let refreshToken: string | null = sessionStorage.getItem("mc_refresh");

export function setTokens(access: string | null, refresh: string | null) {
  accessToken = access;
  refreshToken = refresh;
  if (access) sessionStorage.setItem("mc_access", access);
  else sessionStorage.removeItem("mc_access");
  if (refresh) sessionStorage.setItem("mc_refresh", refresh);
  else sessionStorage.removeItem("mc_refresh");
}

export function getAccessToken() {
  return accessToken;
}

async function parse<T>(res: Response): Promise<T> {
  const json = (await res.json()) as Envelope<T>;
  if (!json.ok) {
    const err = new Error(json.error.message) as Error & { code?: string; status: number };
    err.code = json.error.code;
    err.status = res.status;
    throw err;
  }
  return json.data;
}

async function refreshSession(): Promise<boolean> {
  if (!refreshToken) return false;
  const res = await fetch("/api/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    setTokens(null, null);
    return false;
  }
  const data = await parse<{ accessToken: string; refreshToken: string }>(res);
  setTokens(data.accessToken, data.refreshToken);
  return true;
}

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData) && !headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const res = await fetch(path, { ...init, headers, credentials: "include" });
  if (res.status === 401 && retry && refreshToken) {
    const ok = await refreshSession();
    if (ok) return api<T>(path, init, false);
  }
  if (res.headers.get("content-type")?.includes("application/json")) {
    return parse<T>(res);
  }
  if (!res.ok) throw new Error("Request failed");
  return undefined as T;
}

export function downloadUrl(fileId: string) {
  return `/api/files/${fileId}/download`;
}

export function previewUrl(fileId: string) {
  return `/api/files/${fileId}/preview`;
}

export function versionDownloadUrl(fileId: string, versionId: string) {
  return `/api/files/${fileId}/versions/${versionId}/download`;
}

export function versionPreviewUrl(fileId: string, versionId: string) {
  return `/api/files/${fileId}/versions/${versionId}/preview`;
}

export function publicDownloadUrl(token: string, password?: string) {
  const q = password ? `?password=${encodeURIComponent(password)}` : "";
  return `/api/public/shares/${token}/download${q}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let n = bytes / 1024;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(n >= 10 ? 0 : 1)} ${units[i]}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h ago`;
  if (diff < 6 * 86_400_000) return `${Math.floor(diff / 86_400_000)} d ago`;
  return d.toLocaleDateString();
}

export function fileGlyph(mime: string): string {
  if (mime.startsWith("image/")) return "IMG";
  if (mime.startsWith("video/")) return "VID";
  if (mime.startsWith("audio/")) return "AUD";
  if (mime === "application/pdf") return "PDF";
  if (mime.startsWith("text/") || mime === "application/json") return "TXT";
  if (mime.includes("zip") || mime.includes("vnd")) return "ZIP";
  return "FILE";
}

export async function fetchBlob(path: string): Promise<Blob> {
  const res = await fetch(path, {
    headers: { Authorization: `Bearer ${accessToken ?? ""}` },
    credentials: "include",
  });
  if (!res.ok) throw new Error("Download failed");
  return res.blob();
}

export async function saveBlob(file: CloudFile, path?: string) {
  const blob = await fetchBlob(path ?? downloadUrl(file.id));
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.displayName;
  a.click();
  URL.revokeObjectURL(url);
}
