# Front-end components

The client is React 18 + Vite. Styling = the mockup design system (`src/design.css`, copied from the design package) plus small additions in `src/index.css`; Tailwind utilities are available (`preflight` disabled so the design reset wins). Icons: `lucide-react`; animations: `framer-motion`; server state: TanStack Query; client state: Zustand.

## Pages (`src/pages`)

| Component | Route | What it does |
|---|---|---|
| `Landing` | `/` | Marketing page: hero with animated mock vault, features, "how it stays private" steps, pricing, footer, theme toggle, "Live demo" (pre-fills demo login) |
| `Signup` | `/signup` | Name/email/password, `PasswordStrength` meter, acknowledgement switch; generates keys locally via `api/auth.register` |
| `RecoveryKey` | `/recovery-key` | Shows the 52-char recovery key in 13 groups, download/copy, confirmation switch; activates the pending session |
| `Login` | `/login` | Password step → optional 2FA step (`OtpInput` or backup code). If a session exists but the page was reloaded, shows **Unlock vault** (password only) |
| `Recover` | `/recover` | Email + recovery key + new password → re-wraps master key |
| `FilesPage` | `/app`, `/app/folder/:id`, `/app/recent`, `/app/favorites`, `/app/trash`, `/app/search` | Greeting/breadcrumbs, grid/list toggle, new folder, upload, folder cards, type filters, file grid/table, empty states, empty trash |
| `SharedPage` | `/app/shared` | Table of your share links with status, downloads, expiry, revoke |
| `SettingsPage` | `/app/settings?tab=` | Tabs: Profile, Security (change password, 2FA setup/disable, passkeys roadmap), Devices, Activity, Appearance, Danger zone (delete account) |
| `PublicShare` | `/s/:token#k=…` | Recipient page: reads key from fragment, shows sender & file, password field, decrypts & downloads in browser |
| `AuthLayout` | — | Two-column auth layout (story panel + form card) |
| `NotFound` | `*` | 404 page |

## Layout & feature components (`src/components`)

| Component | Purpose |
|---|---|
| `AppShell` | Logged-in layout: `Sidebar` + `Topbar` + routed page + `DialogHost`; drag files from the desktop anywhere to upload into the current folder (overlay) |
| `Sidebar` | Upload button, nav (My Files, Recent, Favorites, Shared with active-link count, Trash), Settings/Security, `StorageMeter`; slides in on mobile |
| `Topbar` | Search box (client-side over decrypted names → `/app/search`), "Vault unlocked" badge, theme toggle, account menu (lock & sign out) |
| `StorageMeter` | Used / quota with gradient bar (`GET /auth/me`) |
| `FolderCard` | Folder tile with file count; click to open; drop target for file cards; menu: rename, move, trash / restore, delete forever |
| `FileCard` | Grid tile: type-tinted thumbnail, lock badge, favorite star, size · time; draggable; opens details |
| `FileTable` | List view: name, location, modified, size, Encrypted/Shared badge, actions |
| `FileIcon` | Coloured icon square for a MIME type/extension (`lib/format.fileKind`) |
| `FileMenu` | "…" actions for a file (details, download, share, favorite, rename, move, trash; restore/delete in trash) |
| `UploadModal` | Drop zone + file picker; per-file progress (encrypting / chunk x of y / done / failed) |
| `DetailsPanel` | Slide-over: decrypted `Preview`, action buttons, metadata, `VersionHistory`, active share links |
| `Preview` | Renders decrypted blob: image, video, audio, PDF (sandboxed iframe), text/code; progress while decrypting |
| `VersionHistory` | Version timeline; upload new version; download or restore any version |
| `ShareDialog` | Password switch, expiry chips, download limit, label → creates link, copy, revoke |
| `MoveDialog` | Folder tree picker (blocks moving a folder into itself) |
| `DialogHost` | Renders the active dialog from `useDialogs` + details panel + upload modal |

### UI primitives (`src/components/ui`)
`Logo`, `Switch` (accessible toggle), `Modal` (animated glass dialog, Esc/backdrop to close), `Toasts`, `ThemeToggle`, `PasswordInput` (show/hide), `PasswordStrength` (4-segment meter + checks; scoring in `lib/password.js`), `OtpInput` (6 boxes, paste support), `Dropdown`, `EmptyState`, `PromptDialog`, `ConfirmDialog`.

## Hooks (`src/hooks`)

| Hook | Purpose |
|---|---|
| `useListing(view, folderId)` | Query `/files` and decrypt names with the master key |
| `useAllFolders()` | All folders, decrypted (breadcrumbs, move dialog) |
| `useShares()` | Share links with decrypted file names |
| `useRefresh()` | Invalidate file/folder/share/me queries after mutations |
| `useUploader()` | Upload queue: encrypt + upload files, progress into `useUI`, toasts |
| `useFileActions()` | One place for rename/move/favorite/trash/restore/delete/share/download/new folder/empty trash |
| `useDecryptedFile(file)` | Download + decrypt into a Blob URL (revoked on unmount); `saveBlob()` helper |

## Stores (`src/stores`, Zustand)

| Store | State |
|---|---|
| `useAuth` | `user`, `accessToken`, `masterKey` (memory only!), `pending` sign-up; `setSession`, `clear`, `activatePending` |
| `useUI` | toasts, upload queue, upload modal, view mode (grid/list), search text, mobile sidebar |
| `useDialogs` | active dialog `{type, props}` and the file shown in the details panel |
| `useTheme` | `dark`/`light`, persisted in localStorage, toggles `html.light` |

## Crypto & API modules

| Module | Purpose |
|---|---|
| `crypto/core.js` | KDF (Argon2id/PBKDF2), AES-GCM seal/open, key wrapping, chunk encryption, recovery-key encoding, account bootstrap, share-key derivation. Runs in browser and Node. |
| `crypto/vault.js` | `uploadFile`, `downloadFile`, `decryptNames`, `createShare`, `openShareMeta`, `downloadShare` — take an `http` adapter so tests and the seed use the same code |
| `api/http.js` | `api()` JSON helper with silent token refresh; `http` adapter; `refreshSession()` |
| `api/auth.js` | `register`, `login`, `verify2fa`, `logout`, `changePassword`, `recoverAccount`, `authKeyFor` |
| `lib/format.js` | `formatBytes`, `timeAgo`, `formatDate`, `fileKind`, `categoryOf`, `initials` |
