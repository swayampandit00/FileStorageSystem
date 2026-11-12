import fs from "node:fs";
import pg from "pg";
import { config } from "./config.js";
import { hashPassword, randomId } from "./utils/crypto.js";
import { logger } from "./utils/logger.js";

pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
});

fs.mkdirSync(config.storageDir, { recursive: true });

function toPg(sql: string): string {
  let i = 0;
  return sql
    .replace(/INSERT OR IGNORE/gi, "INSERT")
    .replace(/COLLATE NOCASE/gi, "")
    .replace(/ LIKE /gi, " ILIKE ")
    .replace(/\?/g, () => `$${++i}`);
}

export const db = {
  prepare(sql: string) {
    const text = toPg(sql);
    const onConflict =
      /^INSERT\s+/i.test(sql) && /INSERT OR IGNORE/i.test(sql)
        ? text.replace(/;?\s*$/, " ON CONFLICT DO NOTHING")
        : text;
    return {
      async get<T = Record<string, unknown>>(...params: unknown[]): Promise<T | undefined> {
        const r = await pool.query(onConflict, params);
        return r.rows[0] as T | undefined;
      },
      async all<T = Record<string, unknown>>(...params: unknown[]): Promise<T[]> {
        const r = await pool.query(onConflict, params);
        return r.rows as T[];
      },
      async run(...params: unknown[]) {
        const r = await pool.query(onConflict, params);
        return { changes: r.rowCount ?? 0 };
      },
    };
  },
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user','admin')) DEFAULT 'user',
  status TEXT NOT NULL CHECK(status IN ('active','disabled')) DEFAULT 'active',
  quota_bytes BIGINT NOT NULL,
  avatar_color TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trashed_at TEXT,
  color TEXT,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  storage_name TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  trashed_at TEXT,
  description TEXT,
  last_opened_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  expires_at TEXT,
  max_downloads INTEGER,
  download_count INTEGER NOT NULL DEFAULT 0,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  ip TEXT,
  detail TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stars (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK(item_type IN ('file','folder')),
  item_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, item_type, item_id)
);

CREATE TABLE IF NOT EXISTS collab_shares (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK(item_type IN ('file','folder')),
  item_id TEXT NOT NULL,
  grantee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL CHECK(permission IN ('viewer','editor')),
  created_at TEXT NOT NULL,
  UNIQUE(item_type, item_id, grantee_id)
);

CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  item_type TEXT,
  item_id TEXT,
  detail TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS google_accounts (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  google_email TEXT,
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT NOT NULL,
  token_expiry TEXT NOT NULL,
  scope TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS file_versions (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  storage_name TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  UNIQUE(file_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_files_user ON files(user_id);
CREATE INDEX IF NOT EXISTS idx_files_trashed ON files(user_id, trashed_at);
CREATE INDEX IF NOT EXISTS idx_folders_user ON folders(user_id);
CREATE INDEX IF NOT EXISTS idx_shares_file ON shares(file_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at);
CREATE INDEX IF NOT EXISTS idx_stars_user ON stars(user_id);
CREATE INDEX IF NOT EXISTS idx_collab_grantee ON collab_shares(grantee_id);
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_file_versions_file ON file_versions(file_id, version_number);
`;

export async function migrate() {
  const statements = SCHEMA.split(";").map((s) => s.trim()).filter(Boolean);
  for (const statement of statements) {
    await pool.query(statement);
  }
}

export type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  role: "user" | "admin";
  status: "active" | "disabled";
  quota_bytes: number;
  created_at: string;
  updated_at: string;
};

export function publicUser(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    quotaBytes: Number(row.quota_bytes),
    createdAt: row.created_at,
  };
}

export async function trackActivity(userId: string, action: string, extra: {
  itemType?: string;
  itemId?: string;
  detail?: string;
} = {}) {
  await db.prepare(
    `INSERT INTO activity (id, user_id, action, item_type, item_id, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(randomId(), userId, action, extra.itemType ?? null, extra.itemId ?? null, extra.detail ?? null, new Date().toISOString());
}

export async function audit(actorId: string | null, action: string, extra: {
  targetType?: string;
  targetId?: string;
  ip?: string;
  detail?: string;
} = {}) {
  await db.prepare(
    `INSERT INTO audit_events (id, actor_id, action, target_type, target_id, ip, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    randomId(),
    actorId,
    action,
    extra.targetType ?? null,
    extra.targetId ?? null,
    extra.ip ?? null,
    extra.detail ?? null,
    new Date().toISOString()
  );
}

export async function bootstrapAdmin() {
  const existing = await db.prepare("SELECT id FROM users WHERE email = ?").get(config.adminEmail.toLowerCase());
  if (existing) return;
  const now = new Date().toISOString();
  const id = randomId();
  const passwordHash = await hashPassword(config.adminPassword);
  await db.prepare(
    `INSERT INTO users (id, email, password_hash, display_name, role, status, quota_bytes, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'admin', 'active', ?, ?, ?)`
  ).run(id, config.adminEmail.toLowerCase(), passwordHash, "Administrator", config.defaultQuotaBytes * 10, now, now);
  await audit(id, "admin.bootstrap", { targetType: "user", targetId: id });
  logger.info("Admin account bootstrapped", { email: config.adminEmail });
}
