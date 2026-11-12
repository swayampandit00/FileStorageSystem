# Admin panel guide

Admin screens live in `apps/client/src/views/admin/`.

The UI is hidden unless `user.role === "admin"`. Every `/api/admin/*` route also runs `requireAdmin` on the server.

| File | Route | Purpose |
| --- | --- | --- |
| `AdminOverviewView.tsx` | `/admin` | Users, files, bytes, trash, links, people-shares, type breakdown, top storage users |
| `AdminUsersView.tsx` | `/admin/users` | Search, quota, enable/disable |
| `AdminAuditView.tsx` | `/admin/audit` | Recent actions |

## Bootstrap admin

Created on first API start if `ADMIN_EMAIL` is not already in the database. Password comes from `ADMIN_PASSWORD` in `.env` (hashed with bcrypt). Do not reuse the example password outside local demo.

## Users screen

- Search by email or display name
- Quota: enter gigabytes; stored as bytes
- Disable: user cannot sign in (`status = disabled`)
- You cannot disable your own account

Role is stored server-side. Never trust a `role` field from the browser.

## Audit log

Examples of recorded actions:

- `auth.register`, `auth.login`, `auth.login_failed`
- `file.upload`, `file.rename`, `file.trash`, `file.delete`, `file.restore`
- `folder.create`, `folder.trash`, `folder.delete`
- `share.create`, `share.revoke`, `collab.add`
- `admin.user.update`, `admin.bootstrap`

Passwords, tokens, and file contents are not logged.

## Security notes for admins

- Change JWT secrets before any network exposure
- Keep PostgreSQL data and `STORAGE_DIR` off the web root
- Rate limits apply to login/register
- HTTPS is required for public use; cookie `Secure` is on in `NODE_ENV=production`
