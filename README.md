# 🧭 Travel Map (co-note)

A map-based travel journal: record every place you visit on an interactive map and build your own travel notes.

## Features

- Full-screen interactive map (Leaflet + OpenStreetMap) with zoom/pan and GPS geolocation
- Add places: geolocate → reverse-geocode → pick from a candidate list, or drag the marker anywhere and fill in name/description yourself; keyword address search included
- Marker info window: name, address, description, photo strip (center-cropped, horizontally scrollable), 1–5 star meta tags (satisfaction / price / value / fun + custom), note preview; double-click to edit
- Route arrows connecting markers in visit order (previous → latest)
- Marker clustering when zoomed out: single-click a cluster to list its markers, double-click to zoom until every marker is visible; click a list item to jump to and center that marker
- Note groups per place (double-click marker): create / edit / delete / reorder
- Photo uploads per place (PNG / JPG / WebP / GIF, ≤5MB) stored in R2

## Stack

- React Router v7 (SSR) + React 19 + Tailwind CSS v4
- Cloudflare Workers + D1 + R2
- Leaflet, leaflet.markercluster, leaflet-polylinedecorator
- Nominatim geocoding proxy, Google OAuth

## Development

```bash
pnpm install
wrangler d1 migrations apply co-note --local
pnpm dev
pnpm typecheck
pnpm build
pnpm deploy
```

Env vars: `SECRET_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (see `.env.example`).

## Deployment

Deployed on Cloudflare Workers at `co-note.ivanfan.com` (D1 + R2 bindings in `wrangler.jsonc`).
