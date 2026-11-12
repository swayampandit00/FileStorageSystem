# API reference

Base path: `/api`. JSON envelope:

```json
{ "ok": true, "data": {} }
```

```json
{ "ok": false, "error": { "message": "...", "code": "BAD_REQUEST" } }
```

Auth: `Authorization: Bearer <accessToken>` or HttpOnly cookies `access_token` / `refresh_token`.

Access tokens are short-lived. `POST /api/auth/refresh` rotates the refresh token (hash stored in PostgreSQL).

## Auth

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | no | Create user |
| POST | `/api/auth/login` | no | Login |
| POST | `/api/auth/logout` | no | Revoke refresh, clear cookies |
| POST | `/api/auth/refresh` | refresh | New access + refresh |
| GET | `/api/auth/me` | yes | Current user |
| PATCH | `/api/auth/me` | yes | `{ displayName, currentPassword, newPassword }` |

Register body:

```json
{ "email": "ada@example.com", "password": "StrongPass1x", "displayName": "Ada" }
```

## Files and folders

`GET /api/files` query: `folderId`, `q`, `mode=drive|starred|recent|trash|search`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/files` | List (includes `starred`) |
| POST | `/api/files/upload` | Multipart field `file` (up to 12), optional `folderId` |
| POST | `/api/files/bulk` | `{ action, fileIds, folderIds }` trash/restore/star/unstar/purge |
| POST | `/api/files/empty-trash` | Permanent delete of all trashed items |
| GET | `/api/files/:id` | Metadata (owner or collaborator) |
| GET | `/api/files/:id/download` | Stream bytes |
| GET | `/api/files/:id/preview` | Inline stream for image/pdf/text/audio/video |
| GET | `/api/files/:id/versions` | Previous versions (current file is not in this list) |
| POST | `/api/files/:id/replace` | Multipart field `file` — snapshot current, then overwrite |
| POST | `/api/files/:id/versions/:versionId/restore` | Make that version current (snapshots first) |
| GET | `/api/files/:id/versions/:versionId/download` | Stream a previous version |
| GET | `/api/files/:id/versions/:versionId/preview` | Inline stream of a previous version |
| PATCH | `/api/files/:id` | `{ displayName, description, folderId }` |
| POST | `/api/files/:id/copy` | Duplicate bytes on disk |
| POST | `/api/files/:id/star` | `{ starred }` |
| POST | `/api/files/:id/restore` | Out of trash |
| POST | `/api/files/:id/purge` | Delete forever |
| DELETE | `/api/files/:id` | Trash, or purge if already trashed |
| GET | `/api/folders?parentId=` | List folders |
| GET | `/api/folders/tree` | Flat tree for move UI |
| POST | `/api/folders` | `{ name, parentId, color }` |
| PATCH | `/api/folders/:id` | `{ name, color, parentId }` |
| POST | `/api/folders/:id/star` | `{ starred }` |
| POST | `/api/folders/:id/restore` | Out of trash |
| DELETE | `/api/folders/:id` | Trash or purge |
| GET | `/api/storage/usage` | Used / quota / remaining / type breakdown |
| GET | `/api/storage/activity` | Recent user actions |
| GET | `/api/storage/shared-with-me` | Collaborator inbox |

Ownership is always the authenticated user id from the token, never from the body. Disk names are UUIDs.

Replace and restore keep the previous current bytes as a `file_versions` row (max 20 per file, oldest pruned). Version bytes count toward quota. Purge deletes current and version files from `STORAGE_DIR`.

## Google Drive import

Requires `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` on the API. OAuth is read-only (`drive.readonly`). Refresh tokens are encrypted at rest.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/google/status` | yes | `{ configured, connected, email }` |
| GET | `/api/google/connect` | yes | `{ url }` Google consent URL |
| GET | `/api/google/callback` | Google | OAuth redirect; then browser to `/app/import-google` |
| DELETE | `/api/google` | yes | Disconnect and revoke |
| GET | `/api/google/files?parentId=&pageToken=` | yes | List Drive items in a folder |
| POST | `/api/google/import` | yes | `{ folderId, items: [{ id, name, mimeType }] }` copy onto STORAGE_DIR |

Import body:

```json
{ "folderId": null, "items": [{ "id": "1abc", "name": "Notes", "mimeType": "application/vnd.google-apps.folder" }] }
```

Max 50 selected items per request; nested folders copy up to 200 files. Google Docs export as `.docx` / `.xlsx` / `.pptx`.

## Sharing

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/files/:id/share` | owner | Anyone-with-the-link |
| GET | `/api/shares` | yes | List own links |
| DELETE | `/api/shares/:id` | owner | Revoke |
| GET | `/api/public/shares/:token` | token | Metadata |
| GET | `/api/public/shares/:token/download` | token | Download |
| GET | `/api/files/:id/collaborators` | owner | People on a file |
| POST | `/api/files/:id/collaborators` | owner | `{ email, permission: viewer\|editor }` |
| GET | `/api/folders/:id/collaborators` | owner | People on a folder |
| POST | `/api/folders/:id/collaborators` | owner | `{ email, permission }` |
| DELETE | `/api/storage/collaborators/:id` | owner | Remove person |

Share body:

```json
{ "password": "optional", "expiresAt": "2026-12-01T00:00:00.000Z", "maxDownloads": 5 }
```

The raw token is returned once. Database stores SHA-256 of the token.

## Admin (role `admin` only)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/admin/stats` | Counts, breakdown, top users |
| GET | `/api/admin/users?q=` | User list + usage |
| PATCH | `/api/admin/users/:id` | `{ "status", "quotaBytes", "role" }` |
| GET | `/api/admin/audit?limit=` | Audit events |

## Health

`GET /api/health` → `{ "status": "ok", "time": "..." }`

## Error codes (selected)

`UNAUTHENTICATED`, `FORBIDDEN`, `DISABLED`, `EMAIL_TAKEN`, `INVALID_CREDENTIALS`, `TOO_LARGE`, `QUOTA`, `TYPE_NOT_ALLOWED`, `NOT_FOUND`, `SHARE_INVALID`, `SHARE_EXPIRED`, `SHARE_LIMIT`, `SHARE_PASSWORD`, `RATE_LIMIT`, `NO_PREVIEW`, `USER_NOT_FOUND`, `CYCLE`, `GOOGLE_NOT_CONFIGURED`, `GOOGLE_NOT_CONNECTED`, `GOOGLE_RECONNECT`
