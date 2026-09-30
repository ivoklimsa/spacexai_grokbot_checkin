# SpaceXAi Check-in Display

Fullscreen venue kiosk that spawns floating grokbot avatars when people check in. Each bot shows a random avatar above the person's name, drifts around the screen, and bumps away on contact instead of overlapping.

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the clean kiosk (stage, bots, logo, and live arrivals). Live check-ins arrive via Luma → shared store → SSE.

[http://localhost:3000/demo](http://localhost:3000/demo) is an **independent client-only sandbox**. Click **+ Spawn** (or press `S` / `/`, or Random) to add bots — that is the only way bots appear on `/demo`. It is not connected to Luma, `/admin`, or `/api/bots`, and it does not use `localStorage`. Refresh clears demo bots by design. `/` and `/admin` are unchanged and still share the live store.

`/admin` lists check-ins. Reset clears check-ins and project registrations.

[http://localhost:3000/project](http://localhost:3000/project) is a simple form for registering a project (name required; participant, GitHub link, and web page optional). Registrations are shared across browsers through Neon Postgres. The page loads without a database URL; creating, listing, and deleting projects returns **503** until `DATABASE_URL` or `DATABASE_URL_POOLED` is set.

## Live

Production: [https://spacexai-checkin.vercel.app](https://spacexai-checkin.vercel.app)  
Project: `spacexai-grokbot-checkin` on team **Ivo's playground**

## How it works

```
Live (/):
  Luma guest.updated ──POST /api/luma/webhook──► Neon `bots` table ──SSE──► kiosk (/)
  /admin Reset ──► DELETE bots + DELETE /api/projects (all Neon rows)
  (Without DATABASE_URL, bots fall back to process memory — fine for local only.)

Demo (/demo) — separate, client-only:
  Spawn button (S, /, Random) ──► createBot() ──► React state + physics
  (no API, no SSE, no localStorage; refresh clears)

Projects (/project):
  Form ──POST /api/projects──► Neon Postgres
  List ◄──GET /api/projects───
  Participant names ◄──GET /api/bots (suggest only)
```

Client physics (`src/lib/physics.ts`) applies soft float drift, circle–circle elastic bumps, and wall bounce. Name labels ride under avatars but are ignored for hitboxes.

## API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/bots` | Current bot list |
| `POST` | `/api/bots` | Spawn `{ "name": "…" }` |
| `GET` | `/api/bots/stream` | SSE (`hello`, `spawn`, `reset`) |
| `POST` | `/api/luma/webhook` | Luma `guest.updated` → spawn a bot when the guest is checked in on `LUMA_EVENT_ID` |
| `GET` | `/api/projects` | Project registrations, newest first |
| `POST` | `/api/projects` | Create `{ "projectName", "participant"?, "githubUrl"?, "webUrl"? }` |
| `DELETE` | `/api/projects` | Delete every project registration (zero rows still succeeds) |

## Project signup

`/project` stores one registration per submit. The same project name may be registered more than once. There is no auth gate and no per-row delete. `/admin` Reset deletes every registration.

The participant field suggests names from the current check-in list (`GET /api/bots`, `Bot[].name`) when that list has names. A name that is not checked in can still be typed. If the bot list is empty, the field is plain text.

Each record is `{ id, projectName, participant?, githubUrl?, webUrl?, createdAt }`. Rows live in the Postgres table `projects`. They are not stored in `localStorage`. Check-ins live in the separate `bots` table (same database).

Optional GitHub and web values are stored as entered. Values that start with `http://` or `https://` are shown as links.

The `projects` and `bots` tables are created on first use (`CREATE TABLE IF NOT EXISTS`). No manual migration is required.

### Env vars (names only)

The client is `@neondatabase/serverless`. On the Vercel project **`spacexai-grokbot-checkin`**, set these for Production, and for Preview if a preview should keep projects. Copy the values from the Neon dashboard (Connection string). Do not commit them.

| Name | Role |
|------|------|
| `DATABASE_URL_POOLED` | Pooled Neon connection string. Used when it is set. |
| `DATABASE_URL` | Neon connection string. Used when `DATABASE_URL_POOLED` is unset. |

When both are set, queries use `DATABASE_URL_POOLED`. When only one is set, that one is used.

The same URL backs live check-ins (`bots` table) and project registrations (`projects` table). Both tables are created on first use (`CREATE TABLE IF NOT EXISTS`).

If neither name is set, `GET`, `POST`, and `DELETE /api/projects` return **503** with `Project store is not configured`. Check-in APIs still work in process memory (local `next dev`), but that store is **not** shared across Vercel serverless instances — production needs the Neon URL so Luma webhooks and the kiosk see the same bots.

## Luma check-in

A checked-in guest on the one configured event spawns a bot on the shared live field. The kiosk at `/` shows that bot through the existing store and SSE stream. `/demo` is not on that path. There is no separate toast.

Webhooks need **Luma Plus**. The operator sets the env values in Vercel and creates the webhook in Luma. Do not commit those values. This repo does not contain them, and the agent does not provision them.

### Env vars (names only)

| Name | Role |
|------|------|
| `LUMA_WEBHOOK_SECRET` | Turns the webhook on. Unset or blank → `POST /api/luma/webhook` returns **503**. `/demo` spawn is client-only and does not need this. |
| `LUMA_EVENT_ID` | The one Luma event. The value is Luma's event id in **`evt_…`** form. When it is set, a payload whose event id is missing or different is ignored. Set it before going live — if it is blank, checked-in guests from every event are admitted. |

Set both on the Vercel project **`spacexai-grokbot-checkin`** (Production, and Preview if a preview should accept the webhook). Copy the signing secret from Luma when the webhook is created. Copy the event id from that event (`evt_…`).

### Webhook

In Luma: **Calendar → Settings → Developer → Webhooks → Create**.

- URL pattern: `https://<prod-host>/api/luma/webhook`  
  Production: `https://spacexai-checkin.vercel.app/api/luma/webhook`
- Event type: `guest.updated`

Luma sends `Webhook-Signature: t=<unix seconds>,v1=<hex>`. The hex is HMAC-SHA256 of `<timestamp>.<raw body>` using `LUMA_WEBHOOK_SECRET`. A missing or invalid signature returns **401** and does not spawn. Timestamps older than 5 minutes are rejected.

On `guest.updated`, a bot is spawned only when the guest is checked in (`checked_in_at` on the guest, or on any `event_tickets[]` entry) and the event id matches `LUMA_EVENT_ID`. The event id is `data.event.id` (official payload), then `data.event.api_id`, then `data.event_api_id`. Display name order is `user_name`, then `name`, then `user.name`. The bot id is the guest id (`api_id`, else `id`), so the same guest does not create a second bot. Any other event type, a guest who is not checked in, or a different event is ignored (`200` with `ignored: true`).

### Probe without live Luma

`scripts/luma-webhook-fixture.mjs` signs payloads with a **fixture** signer and posts them. The fixture signer is not a Luma or Vercel secret. Point the server at the same fixture values, then run the script:

```bash
LUMA_WEBHOOK_SECRET=fixture-not-a-real-secret LUMA_EVENT_ID=evt_probe npm run dev
```

```bash
LUMA_WEBHOOK_SECRET=fixture-not-a-real-secret LUMA_EVENT_ID=evt_probe npm run luma:fixture
```

That run clears the in-memory field (`DELETE /api/bots`), then covers:

3. Checked-in guest on `evt_probe` → bot named from `user_name` (also the official `event.id` + ticket `checked_in_at` shape, and the `name` / `user.name` fallbacks).
4. The same guest id again → still one bot.
5. A different `event_api_id` → ignored, no spawn.
6. `guest.updated` that is not checked in → ignored, no spawn.
7. Bad or missing signature → **401**, no spawn.

`npm run luma:fixture -- --print-curl` prints curls instead of sending. Signatures expire after 5 minutes. The script refuses to reset a non-localhost host unless you pass `--allow-reset`.

Secret unset on the server (check 2):

```bash
npm run luma:fixture -- --expect-inactive
```

`POST /api/luma/webhook` returns **503**. On localhost the script also `POST /api/bots` to confirm API spawn still works, then deletes that bot.

## Notes

- On `/` (and `/admin`), the bot list is also cached in the browser via `localStorage` (`spacexai-checkin-bots`) so a refresh keeps groks while SSE reconnects. The durable source of truth on production is Neon (`bots`). Open SSE connections re-read Neon every ~2s so a webhook that landed on another instance still appears. `/demo` skips persistence entirely — refresh clears its bots. `/project` does not use that key.
- Avatars live in `public/avatars/bot-01.png` … `bot-12.png`.
- Deploy only to the Vercel project **`spacexai-grokbot-checkin`**.
<!-- noop: re-trigger Vercel preview for PR #8 -->
