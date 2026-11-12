# Setup guide

Beginner-friendly steps to run MyCloud on this computer or on a second PC used as the storage server.

## What you get

- User panel: register, login, upload, folders, download, rename, delete, share
- Admin panel: users, quotas, disable accounts, audit log
- File bytes saved as random names under `data/files` (or `STORAGE_DIR`) on the storage PC disk
- Login, signup, and file metadata in PostgreSQL

Do not expose this server to the public internet until you change secrets, enable HTTPS, and finish the checklist in `docs/ARCHITECTURE.md`.

## Requirements

- Node.js 20 LTS or newer (`node -v`)
- npm (`npm -v`)
- PostgreSQL 15 or newer (`psql --version`)
- Enough free disk for user files

On Windows, install Node LTS from https://nodejs.org/en/download and PostgreSQL from https://www.postgresql.org/download/windows/

## 1. Create the PostgreSQL database

On the machine that will run the API (the storage PC):

```bash
sudo -u postgres psql
```

Then:

```sql
CREATE USER mycloud WITH PASSWORD 'mycloud_dev_pass';
CREATE DATABASE mycloud OWNER mycloud;
GRANT ALL PRIVILEGES ON DATABASE mycloud TO mycloud;
\q
```

Change that password before any real use. Dev default URL:

```text
postgres://mycloud:mycloud_dev_pass@127.0.0.1:5432/mycloud
```

Tables are created automatically on first API start (`migrate()`).

## 2. Server environment

```bash
cd apps/server
cp .env.example .env
```

Edit `.env`:

- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — long random strings (not the example values in production)
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — first admin login (used only if that email does not exist yet)
- `STORAGE_DIR` — where file bytes go. On the storage PC use something like `C:/MyCloudData/files` or `/var/mycloud/files`
- `DATABASE_URL` — PostgreSQL connection string, e.g. `postgres://mycloud:mycloud_dev_pass@127.0.0.1:5432/mycloud`
- `WEB_ORIGIN` — exact browser origin (CORS). Dev default is `http://localhost:5173`
- `CORS_ORIGINS` — extra allowed origins (comma-separated), e.g. Expo web `http://localhost:8081`
- `HOST` — API bind address. Use `0.0.0.0` so a phone on the LAN can reach the API. Default in `.env.example` is `0.0.0.0`
- `PORT` — API port, default `3001`
- `MAX_UPLOAD_BYTES` — per-file limit (default 50 MB)
- `DEFAULT_QUOTA_BYTES` — new user quota (default 1 GB)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` — optional; needed so users can import from Google Drive

Never commit `.env`. Never put secrets in the client.

## 2b. Google Drive import (optional)

Users can grant read-only Drive access, pick files or folders, and copy them onto this server.

1. Open [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create an OAuth client (Web application)
3. Authorized JavaScript origins: your web origin, e.g. `http://localhost:5173`
4. Authorized redirect URI must match `GOOGLE_REDIRECT_URI` exactly, default:

```text
http://localhost:5173/api/google/callback
```

5. Enable the Google Drive API for that project
6. Put the client id and secret in `apps/server/.env`
7. Restart the API

Scopes used: `drive.readonly` and `email`. Tokens are encrypted in PostgreSQL. Disconnect revokes the token.

## 3. Install and start API

```bash
cd apps/server
npm install
npm run dev
```

Check health:

```text
http://127.0.0.1:3001/api/health
```

Expected: `{"status":"ok", ...}`

First start creates tables, then the admin user from `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

## 4. Install and start web UI

In another terminal:

```bash
cd apps/client
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

The Vite config proxies `/api` to `http://127.0.0.1:3001`, so the browser only talks to one origin.

## 5. First login

1. Open the welcome page
2. Sign in as admin, or Register a normal user
3. User panel: `/app`
4. Admin panel (admin role only): `/admin`

Default bootstrap admin:

- Email: value of `ADMIN_EMAIL`
- Password: value of `ADMIN_PASSWORD`

Change that password in `.env` before any real use, then create a new admin and disable the old one from the admin users screen.

## 6. Two-PC layout (recommended)

Keep file bytes and the database on one dedicated storage PC. Other computers only open the web UI.

### Storage PC (API + PostgreSQL + disk)

1. Install Node.js, PostgreSQL, and this repo
2. Create the `mycloud` database (section 1)
3. Put files outside the Git repo:

```bat
mkdir C:\MyCloudData
mkdir C:\MyCloudData\files
```

4. Set in `apps/server/.env`:

```env
STORAGE_DIR=C:/MyCloudData/files
DATABASE_URL=postgres://mycloud:CHANGE_ME@127.0.0.1:5432/mycloud
HOST=0.0.0.0
PORT=3001
WEB_ORIGIN=http://192.168.1.20:5173
```

Use the LAN IP of the PC that will run the browser (or the storage PC if the UI also runs there). `WEB_ORIGIN` must match the exact origin, including port.

5. Start the API on the storage PC (`npm run dev` in `apps/server`)
6. Keep the PC awake and powered
7. Allow TCP 3001 only from your LAN in the Windows firewall; do not port-forward the router during development

Do not serve `C:\MyCloudData` with `express.static`. Downloads always go through auth or a valid share token.

### Client PC / phone (browser only)

On the same LAN, open:

```text
http://STORAGE_PC_LAN_IP:5173
```

If Vite runs on the storage PC, that is enough. If you run the web UI on another PC, set its proxy target (or `EXPO_PUBLIC_API_URL` for a future mobile client) to:

```text
http://STORAGE_PC_LAN_IP:3001
```

`127.0.0.1` on the phone is the phone itself. Always use the storage PC LAN IP.

## 7. Backup

Copy both:

1. A PostgreSQL dump (`pg_dump mycloud > mycloud.sql`)
2. The whole `STORAGE_DIR` folder

A tunnel or preview URL is not a backup. Test restore into a separate folder and database.

## Common errors

**`node` not recognized** — install Node LTS, close and reopen the terminal.

**`password authentication failed for user "mycloud"`** — `DATABASE_URL` user/password does not match PostgreSQL. Recreate the role or fix the URL.

**`ECONNREFUSED 127.0.0.1:5432`** — PostgreSQL is not running. Start the service, then retry `npm run dev`.

**Upload too large** — file bigger than `MAX_UPLOAD_BYTES`, or quota full.

**401 on every request** — session expired; sign in again.

**CORS error** — `WEB_ORIGIN` must match the exact browser origin, including port. For Expo, add the Expo origin to `CORS_ORIGINS` or use a LAN origin (dev also allows localhost / private LAN hosts).

## 8. Expo app (phone preview and Android APK)

The Vite web UI stays at `apps/client`. The phone app is a separate Expo project at `apps/mobile` (SDK 58, Expo Router).

### Point the app at the API

```bash
cd apps/mobile
cp .env.example .env
```

Set `EXPO_PUBLIC_API_URL` to the storage PC API, **not** `127.0.0.1` if you open the app on a phone:

```env
EXPO_PUBLIC_API_URL=http://STORAGE_PC_LAN_IP:3001
```

On the same computer (Expo web in a browser): `http://127.0.0.1:3001` is fine.

The API must listen on the LAN (`HOST=0.0.0.0` in `apps/server/.env`). Restart the API after changing `HOST` or CORS.

### Expo Go (fast preview on a phone)

1. Start the API (`npm run dev` in `apps/server`)
2. Same LAN, phone and storage PC
3. Install Expo Go from the Play Store
4. Start Metro:

```bash
cd apps/mobile
npm install
npx expo start
```

5. Scan the QR code in Expo Go
6. Sign in with the same MyCloud account as the web UI

If the app cannot reach the API: the phone is using `127.0.0.1` (that is the phone itself). Put the storage PC LAN IP in `EXPO_PUBLIC_API_URL`, then restart Expo with `npx expo start --clear`.

### Expo web (browser)

```bash
cd apps/mobile
npx expo start --web --host lan --port 8081
```

This is a React Native web preview of the mobile screens, not a replacement for `apps/client`.

### Android APK (EAS)

You do not need Android Studio on this PC. EAS builds in the cloud.

1. Create an Expo account at https://expo.dev
2. From `apps/mobile`:

```bash
npx eas-cli@latest login
npx eas-cli@latest build:configure
npx eas-cli@latest build -p android --profile preview
```

`eas.json` profile `preview` sets `android.buildType` to `apk`, so the result installs on a device or emulator (not a Play Store AAB).

3. When the build finishes, download the APK from the Expo dashboard or the link the CLI prints
4. On the phone: allow install from unknown sources, open the APK
5. The APK still talks to `EXPO_PUBLIC_API_URL`. For a real install, bake in the storage PC LAN URL (or your HTTPS origin) before building

Google Drive import on mobile opens the same OAuth URL as the web app. Finish sign-in in the browser, then return to the app and pull to refresh status.

On the phone: tap a file to preview or download, use **Gallery** / **Camera** on My Drive, and open **New version** on a file to replace it (previous bytes stay on the server disk). Camera/gallery need Expo Go or an APK; the browser preview uses the file picker instead.
