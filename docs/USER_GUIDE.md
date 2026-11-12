# User panel guide

User screens live in `apps/client/src/views/user/`.

| File | Route | Purpose |
| --- | --- | --- |
| `WelcomeView.tsx` | `/` | Landing |
| `LoginView.tsx` | `/login` | Sign in |
| `RegisterView.tsx` | `/register` | Create account |
| `DashboardView.tsx` | `/app` | Home: quota, type breakdown, recents, activity |
| `FilesView.tsx` | `/app/files` | My Drive: grid/list, drag-drop upload, preview |
| `ImportGoogleView.tsx` | `/app/import-google` | Connect Google Drive, pick files/folders, import |
| `SharedWithMeView.tsx` | `/app/shared-with-me` | Items other users granted you |
| `SharedView.tsx` | `/app/shared` | Anyone-with-the-link tokens you created |
| `StarredView.tsx` | `/app/starred` | Starred files and folders |
| `RecentView.tsx` | `/app/recent` | Recently opened / updated |
| `TrashView.tsx` | `/app/trash` | Restore or delete forever |
| `AccountView.tsx` | `/app/account` | Name, password, quota |
| `SharePublicView.tsx` | `/share/:token` | Public share page (no login) |

Shared Drive UI lives in `apps/client/src/components/DriveExplorer.tsx`.

## Drive basics

- Drag files onto My Drive or use **New upload** (multi-file)
- **From Google Drive** — grant Drive permission, tick files or folders, then import a copy onto this server
- Double-click a folder to open it; breadcrumbs go back
- Double-click a file to preview (images, PDF, text, audio, video)
- **Versions** (list view or the preview drawer) — upload a replacement or restore an older copy. The current file is saved first (up to 20 versions)
- Grid / List toggle and sort by name, modified, or size
- Search matches file and folder names

## Select and bulk

Click tiles or use checkboxes in list view, then:

- Star / unstar
- Move to another folder
- Move to trash
- In trash: restore or delete forever

## Organise

- **New folder** in the current directory
- **Rename**, **Make a copy** (duplicates bytes on disk under a new UUID)
- **Move** selected items via the folder dropdown

Delete first sends items to Trash. Only **Delete forever** / **Empty trash** removes the disk file (including version history).

## Versions

Open **Versions** on a file. **Upload new version** replaces the current bytes and keeps the old copy. **Restore** on a listed version does the same in reverse. History is per file, stored as extra UUID files on this disk.

On the Expo app: tap a file to preview or download on the phone, use **Gallery** / **Camera** on My Drive to upload photos, and use **New version** on the file screen.

## Sharing

Two kinds, both still stored on this server:

1. **Link** — unguessable token, optional password, expiry, download cap. Token shown once. Manage on Link shares.
2. **People** — share with another registered email as viewer or editor. They see it under Shared with me.

Private files are never public by default.

## Import from Google Drive

1. Open **From Google Drive** (sidebar or My Drive toolbar)
2. Click **Allow Google Drive access** and approve read-only permission in Google
3. Browse folders, tick the files or folders you want
4. Click **Import selected** — copies land in My Drive (or the folder you came from)

Google keeps the originals. Docs/Sheets/Slides export as Office files. Disconnect anytime from the same screen.

Admin must set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` first (see `docs/SETUP.md`).

## Settings

Change display name. Password change needs the current password. Quota chart splits images, videos, documents, archives.
