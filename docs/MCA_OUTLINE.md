# MCA documentation outline

Use this as the report skeleton. Fill results with real screenshots and test logs. Do not invent outcomes.

## Abstract

Self-hosted cloud file storage: users upload and manage files through a web panel; the server stores bytes on local disk and metadata in PostgreSQL. An admin panel manages quotas, account status, and audit events.

## Objectives

- Replace third-party object storage with owner-controlled disk
- Multi-user isolation
- Controlled sharing (token, expiry, password, revoke)
- Admin governance

## Problem statement

Students and small teams need Drive-like UX without sending files to a commercial cloud. A leftover Windows laptop can hold data if the API is careful about auth, paths, and backups.

## Scope

In: web user panel (Drive-style My Drive, trash, stars, recents, preview, versions, people share, link share), Expo mobile (preview/download, camera/gallery upload, versions), web admin panel, local disk, PostgreSQL.

Out of this demo: Expo APK/EAS, Cloudflare Tunnel production, encryption at rest.

## Architecture

See `docs/ARCHITECTURE.md`. ER: users 1—N folders, files, refresh_tokens, shares, audit_events.

## Testing (record actual results)

1. Register + duplicate email
2. Login success / wrong password
3. Password hashes in PostgreSQL (not plaintext)
4. Upload + download checksum
5. Oversize rejected
6. User A cannot read User B files
7. Expired/revoked share fails
8. Errors hide disk paths
9. Restart keeps data
10. Admin-only routes return 403 for normal users

## Limitations

Laptop availability, HDD risk, no encryption at rest in this build, MIME detection is best-effort, Windows 10 support window.

## Future scope

Encryption at rest, virus scanning.

## Viva questions

- Why UUID storage names instead of user filenames?
- Why hash refresh tokens?
- Why admin UI hide is not enough?
- Difference between HTTPS and encryption at rest?
- Why not `express.static` on the files folder?
