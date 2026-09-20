# 🧭 Map Explore (co-note)

A map-based content platform: users publish geo-tagged posts, visitors discover them by location.

## Features

- Explore map: full-screen AMap (GCJ-02) showing locations with posts in the current viewport — a pin for a single post, a count bubble for several; refreshes as you pan/zoom
- Bottom drawer: tap a location marker to list its posts (cursor pagination); tap a card to open the post
- Post detail: public SSR page (title, content, photo grid, author, location); the author can edit, delete and manage photos
- Create post: GPS / keyword search / drag-to-pick location → reverse geocode and normalize into a location → title, content, visibility (public/private) and photos
- Auth: Google OAuth; browsing needs no login, publishing/editing does; private posts are author-only

## Stack

- React Router v7 (SSR) + React 19 + Tailwind CSS v4
- Cloudflare Workers + D1 + R2
- AMap (Gaode) JS API 2.0 (client script injection) + AMap Web Service geocoding proxy
- Google OAuth

## Data model

- `users`: Google account users
- `locations`: normalized POIs (matched by AMap POI id or ~50m proximity), with a denormalized `post_count`
- `posts`: geo-tagged posts (author / location / coordinate snapshot / visibility), coordinates in GCJ-02
- `post_media`: ordered post photos (R2 keys)

## Development

```bash
pnpm install
pnpm db:migrate   # apply migrations to local D1 (wrangler d1 migrations apply co-note --local)
pnpm dev          # http://localhost:5173
pnpm lint
pnpm typecheck
pnpm build
pnpm deploy       # build and deploy to Cloudflare
```

Env vars: `SECRET_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `VITE_AMAP_KEY`, `VITE_AMAP_SECURITY_CODE` (JS API, client), `AMAP_WEB_KEY` (Web Service, server) — see `.env.example`. All keys come from the AMap open platform console; the JS API key needs a domain whitelist.

## Deployment

Deployed on Cloudflare Workers at `co-note.ivanfan.com` (D1 + R2 bindings in `wrangler.jsonc`). Pushing to `main` runs lint / typecheck / build, remote D1 migrations and deploy.
