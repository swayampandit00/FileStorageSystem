# Where to look in the code

## User panel

`apps/client/src/views/user/`

- Welcome, login, register
- Home, My Drive, Google Drive import, shared with me, link shares, starred, recent, trash, settings
- Public share page

Drive grid/list UI: `apps/client/src/components/DriveExplorer.tsx`

## Admin panel

`apps/client/src/views/admin/`

- Overview stats + storage breakdown
- User list / quota / disable
- Audit log

## API

`apps/server/src/`

- `index.ts` — app bootstrap
- `routes/` — HTTP
- `services/` — auth, files, shares, google
- `middleware/auth.ts` — JWT + admin role
- `db.ts` — schema, migrations, admin bootstrap

## Client wiring

- `apps/client/src/main.tsx` — routes
- `apps/client/src/components/Guards.tsx` — auth / admin gates
- `apps/client/src/api/client.ts` — fetch + token refresh

## Mobile (Expo)

`apps/mobile/src/`

- `app/` — Expo Router screens (welcome, login, register, Drive tabs, file preview, Google import, admin)
- `api/client.ts` — same JSON API as the web client; uses `EXPO_PUBLIC_API_URL`
- `auth/` — session + SecureStore / localStorage tokens
- `components/DriveList.tsx` — My Drive / starred / recent / trash (Files / Gallery / Camera upload)
- `files/local.ts` — download to cache, native preview / share
