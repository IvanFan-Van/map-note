# co-note · 共享便笺

A shared sticky-note board for you and your friends. Pin notes anywhere on an infinite canvas, edit them together in real time, and keep a record of everyday life.

> 中文版: [README.zh-CN.md](./README.zh-CN.md)

## Features

- **Infinite canvas board** — pan, zoom, and double-click empty space to create a note (with a non-blocking confirm dialog)
- **Sticky notes** (240×320, minimalist single-color cards) — drag to move, double-click to open the editor
- **WYSIWYG editor** (TipTap) — markdown syntax stays in the background; select text and apply **rough hand-drawn annotations** (box / circle / underline / highlight / strike-through / crossed-off / brackets / multiline) with per-annotation colors via a color picker
- **Real-time collaboration** (Pusher presence channels) — notes appear, move, and disappear live across users
- **Google OAuth** login (Authorization Code + PKCE)
- **Board sharing** — invite collaborators by user ID (editor / viewer roles)
- **Image uploads** — markdown `![alt](url)` images stored in Cloudflare R2

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, React Router v7 (SSR), Tailwind CSS v4 |
| Editor | TipTap (ProseMirror) + rough-notation |
| Backend | Cloudflare Workers (React Router server build) |
| Database | Cloudflare D1 (SQLite) |
| Storage | Cloudflare R2 (images) |
| Realtime | Pusher (presence channels, self-implemented REST trigger) |
| State | Zustand |
| Tooling | TypeScript, ESLint (typescript-eslint), pnpm |

## Getting Started

### Prerequisites

- Node.js ≥ 20 (pnpm via Corepack: `corepack enable`)
- A Cloudflare account (for local D1 emulation via Wrangler)

### Install

```bash
pnpm install
```

### Environment variables

Create a `.env` file (see `.env.example` if present). Needed keys:

| Key | Purpose |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account id (dev) |
| `CLOUDFLARE_DATABASE_ID` | Local D1 database id |
| `CLOUDFLARE_SERVICES_API_TOKEN` | Cloudflare API token (deploy) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth app credentials |
| `PUSHER_APP_ID` / `PUSHER_CLUSTER` / `PUSHER_KEY` / `PUSHER_SECRET` | Pusher app credentials |
| `SECRET_KEY` | Session signing secret |

### Initialize the local database

```bash
pnpm db:migrate   # applies migrations/ to the local D1 database
```

### Development

```bash
pnpm dev
```

Open http://localhost:5173 — the Vite dev server runs the app in the Workerd runtime (Cloudflare Workers emulation) with hot reload.

### Quality checks

```bash
pnpm lint       # eslint (typescript-eslint)
pnpm typecheck  # react-router typegen + tsc
```

## Notes Markdown Syntax

Notes are stored as plain text with a lightweight custom markdown syntax:

- **Blocks** — headings `# ## ###`, lists `-` / `1.`, blockquote `>`, images `![alt](url)`
- **Inline** — bold `**text**`, italic `*text*`, code `` `text` ``, links `[text](url)`
- **Annotations** (rough-notation, persist in the text):
  - `==highlight==` `^^underline^^` `[[box]]` `((circle))` `~~strike~~` `××crossed-off××` `⟦brackets⟧`
  - Triple markers (`===` `^^^` `[[[` …) mark the multiline variant
  - Per-annotation color: `[[#e11d48|text]]` (any 6-digit hex prefix)

> Tip: you rarely need to type these — the editor's floating toolbar (BubbleMenu) applies and removes annotations on selected text, with an 8-color picker.

## Testing Two Users Locally

1. Start `pnpm dev`
2. Open two browser profiles (or two Playwright sessions) and sign in with two Google accounts
3. Both open the same board — presence avatars and live updates confirm the realtime channel
4. Create/move/delete notes in one window and watch the other update without refresh

## Deployment

The app is designed for **Cloudflare Workers**:

```bash
pnpm run deploy   # react-router build && wrangler deploy
```

- D1 migrations: `pnpm db:migrate` (local) / `wrangler d1 migrations apply co-note --remote` (production)
- Worker secrets (`SECRET_KEY`, Google OAuth, Pusher) are injected via `wrangler secret put` (or the CI/CD pipeline)
- CI/CD (GitHub Actions): `ci.yml` runs lint/typecheck/build on PRs; `deploy.yml` deploys to production on push to `main` (build → D1 migrations → secrets → `wrangler deploy`)

See `docs/DEPLOYMENT.md` for the full setup guide.

## Project Structure

```
app/
  components/        UI components (board / markdown / editor / ui)
  lib/               markdown parser, TipTap converter, store, pusher client
  routes/            pages + API routes
  routes/api/        REST API (notes, boards, invitations, images, pusher-auth…)
  server/            db (D1), auth, oauth, pusher trigger
  app.css            global reset + Tailwind theme + component styles
migrations/          D1 schema migrations
workers/app.ts       Cloudflare Worker entry
docs/                specifications, changelog, code-quality review
```

## License

MIT
