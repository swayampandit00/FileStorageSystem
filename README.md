# MyCloud — Self-Hosted Cloud File Storage

Google Drive-style personal cloud on your own disk: My Drive, trash, stars, recents, preview, people sharing, secret links, and optional import from Google Drive. File bytes stay on this machine (`STORAGE_DIR`). PostgreSQL stores login, signup, metadata, shares, and audit events.

## Layout

```text
apps/server          Node.js + Express + TypeScript API
apps/client          Vite + React web app
apps/client/src/views/user    User panel screens
apps/client/src/views/admin   Admin panel screens
docs                 Setup, API, user, admin, MCA guides
data/files           Uploaded file bytes (not in Git)
```

## Quick start

Read `docs/SETUP.md` first. Short version:

```bash
cd apps/server
cp .env.example .env
npm install
npm run dev
```

```bash
cd apps/client
npm install
npm run dev
```

Open the Vite URL. API calls go through `/api` (Vite proxy to port 3001).

Default admin (change immediately):

- Email: `admin@mycloud.local`
- Password: `ChangeThisAdminPassword123!`

## Docs

- `docs/SETUP.md` — install, run, Windows laptop notes
- `docs/USER_GUIDE.md` — user panel
- `docs/ADMIN_GUIDE.md` — admin panel
- `docs/API.md` — endpoints
- `docs/ARCHITECTURE.md` — how storage and auth work
- `docs/MCA_OUTLINE.md` — report / viva outline
