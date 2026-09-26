# SpaceXAi Check-in Display

Fullscreen venue kiosk that spawns floating grokbot avatars when people check in. Each bot shows a random avatar above the person's name, drifts around the screen, and bumps away on contact instead of overlapping.

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the clean kiosk (stage, bots, logo, and live arrivals).

Demo spawn is at [http://localhost:3000/demo](http://localhost:3000/demo). On `/demo`, click **+ Spawn** (or press `S` / `/`) to add bots. Both routes share the same bot field.

## Live

Production: [https://spacexai-checkin.vercel.app](https://spacexai-checkin.vercel.app)  
Project: `spacexai-grokbot-checkin` on team **Ivo's playground**

## How it works

```
Demo Spawn UI ──POST /api/bots──► in-memory store ──SSE──► all open kiosk tabs
Luma webhook (later) ─────────────► same store
```

Client physics (`src/lib/physics.ts`) applies soft float drift, circle–circle elastic bumps, and wall bounce. Name labels ride under avatars but are ignored for hitboxes.

## API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/bots` | Current bot list |
| `POST` | `/api/bots` | Spawn `{ "name": "…" }` |
| `GET` | `/api/bots/stream` | SSE (`hello`, `spawn`, `reset`) |
| `POST` | `/api/luma/webhook` | Luma `guest.updated` stub |

## Luma (later)

Webhooks need **Luma Plus**. When ready:

1. Set env vars:

```bash
LUMA_WEBHOOK_SECRET=whsec_...
LUMA_EVENT_ID=evt_...   # optional filter
```

2. In Luma: Calendar → Settings → Developer → Webhooks → Create  
   URL: `https://YOUR_DOMAIN/api/luma/webhook`  
   Event type: `guest.updated`

3. On check-in, the stub verifies the signature, confirms `event_tickets[].checked_in_at` (or top-level `checked_in_at`), and spawns a bot with the guest name. Duplicate guest ids are ignored.

Until `LUMA_WEBHOOK_SECRET` is set, the webhook returns `503` and demo spawn remains the source of bots.

## Notes

- Bot list is persisted in the browser via `localStorage` (`spacexai-checkin-bots`) so a refresh or stuck tab reload keeps spawned groks. Live SSE still uses the in-memory server store for multi-tab updates during a warm session.
- Avatars live in `public/avatars/bot-01.png` … `bot-12.png`.
- Deploy only to the Vercel project **`spacexai-grokbot-checkin`**.
<!-- noop: re-trigger Vercel preview for PR #8 -->
