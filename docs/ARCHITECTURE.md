# Architecture

```text
Browser (Vite React)     Expo app (Android / web)
  views/user + admin       apps/mobile Expo Router
        |                         |
        |  /api (dev proxy)       |  EXPO_PUBLIC_API_URL
        v                         v
              Node.js Express API
        |----------------------|
        v                      v
    PostgreSQL              Local disk bytes
    users, files,          STORAGE_DIR / UUID names
    versions, shares,      (current + up to 20 old copies)
    audit
```

## Why two view folders

- `apps/client/src/views/user` — anything a normal account uses
- `apps/client/src/views/admin` — operator screens only

Shared chrome (`Layout`, auth, API client) stays outside those folders so business screens stay easy to find for the MCA demo.

## Drive-style features (still self-hosted)

Trash, stars, recents, copy, move, bulk actions, in-browser preview, people sharing, public links, and file versions all use the same local `STORAGE_DIR`. Copy duplicates the file under a new UUID (no version history on the copy). Replace/restore snapshots the current UUID then writes a new one. Trash only removes bytes on purge / empty trash.

## Storage rules

- Disk file name is a generated UUID (plus a short extension). Original name is metadata only.
- Paths are resolved under `STORAGE_DIR`; traversal is rejected.
- API never returns the local path.
- `express.static` is not used on the storage folder.
- Failed/oversized uploads delete the temp file.

## Auth model

- Password: bcryptjs (cost 12)
- Access JWT (short TTL) + rotating refresh token
- Refresh token stored as SHA-256
- Web cookies: HttpOnly, SameSite=lax, Secure in production
- Tokens also returned in JSON for non-cookie clients
- Role and user id come only from a verified token + database row
- Optional Google Drive import: OAuth `drive.readonly`, refresh token AES-256-GCM encrypted in `google_accounts`, bytes copied into `STORAGE_DIR`

## Threat notes (home laptop)

A home laptop is not enterprise hosting. Power loss, HDD failure, ISP upload speed, and OS sleep all affect availability. HTTPS in transit is not disk encryption. Do not claim encryption at rest unless you add it.

Public checklist before any tunnel or domain:

1. Unique JWT secrets and admin password
2. Auth, quotas, type/size limits tested
3. CORS allowlist is the real web origin, not `*`
4. Health/debug endpoints do not leak paths
5. Backups of DB + files exist off-device
6. OS is supported and firewalled
