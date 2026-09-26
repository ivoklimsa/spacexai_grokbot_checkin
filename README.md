# SpaceXAi Check-in Display

Fullscreen venue kiosk that spawns floating grokbot avatars when people check in. Each bot shows a random avatar above the person's name, drifts around the screen, and bumps away on contact instead of overlapping.

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the clean kiosk (stage, bots, logo, and live arrivals).

Demo spawn is at [http://localhost:3000/demo](http://localhost:3000/demo). On `/demo`, click **+ Spawn** (or press `S` / `/`) to add bots. Both routes share the same bot field.

`/admin` lists check-ins and can reset the field.

## Live

Production: [https://spacexai-checkin.vercel.app](https://spacexai-checkin.vercel.app)  
Project: `spacexai-grokbot-checkin` on team **Ivo's playground**

## How it works

```
Demo Spawn UI ──POST /api/bots──────────► in-memory store ──SSE──► kiosk (/ and /demo)
Luma guest.updated ──POST /api/luma/webhook──► same store
```

Client physics (`src/lib/physics.ts`) applies soft float drift, circle–circle elastic bumps, and wall bounce. Name labels ride under avatars but are ignored for hitboxes.

## API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/bots` | Current bot list |
| `POST` | `/api/bots` | Spawn `{ "name": "…" }` |
| `GET` | `/api/bots/stream` | SSE (`hello`, `spawn`, `reset`) |
| `POST` | `/api/luma/webhook` | Luma `guest.updated` → spawn a bot when the guest is checked in on `LUMA_EVENT_ID` |

## Luma check-in

A checked-in guest on the one configured event spawns a bot on the shared field. The kiosk (`/` and `/demo`) shows that bot through the existing store and SSE stream. There is no separate toast.

Webhooks need **Luma Plus**. The operator sets the env values in Vercel and creates the webhook in Luma. Do not commit those values. This repo does not contain them, and the agent does not provision them.

### Env vars (names only)

| Name | Role |
|------|------|
| `LUMA_WEBHOOK_SECRET` | Turns the webhook on. Unset or blank → `POST /api/luma/webhook` returns **503**. `/demo` spawn keeps working. |
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

`POST /api/luma/webhook` returns **503**. On localhost the script also `POST /api/bots` to confirm demo spawn still works, then deletes that bot.

## Notes

- Bot list is persisted in the browser via `localStorage` (`spacexai-checkin-bots`) so a refresh or stuck tab reload keeps spawned groks. Live SSE still uses the in-memory server store for multi-tab updates during a warm session.
- Avatars live in `public/avatars/bot-01.png` … `bot-12.png`.
- Deploy only to the Vercel project **`spacexai-grokbot-checkin`**.
<!-- noop: re-trigger Vercel preview for PR #8 -->
