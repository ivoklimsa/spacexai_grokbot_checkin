import { NextResponse } from "next/server";
import { spawnBot } from "@/lib/bot-store";
import {
  guestDisplayName,
  guestEventId,
  guestId,
  isCheckedIn,
  isGuestUpdated,
  verifyWebhookSignature,
  type LumaWebhookBody,
} from "@/lib/luma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Luma `guest.updated` webhook.
 * Inactive (503) until LUMA_WEBHOOK_SECRET is set. When LUMA_EVENT_ID is set,
 * only a checked-in guest on that event (`evt_…`) spawns a bot.
 */
export async function POST(request: Request) {
  const secret = process.env.LUMA_WEBHOOK_SECRET?.trim() ?? "";
  const expectedEventId = process.env.LUMA_EVENT_ID?.trim() ?? "";

  if (!secret) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Luma webhook inactive. Set LUMA_WEBHOOK_SECRET to enable. Bind one event with LUMA_EVENT_ID (evt_… id).",
      },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get("webhook-signature");

  if (!verifyWebhookSignature(secret, signature, rawBody)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: LumaWebhookBody;
  try {
    body = JSON.parse(rawBody) as LumaWebhookBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isGuestUpdated(body)) {
    return NextResponse.json({ ok: true, ignored: true, reason: "not_guest_updated" });
  }

  const guest = body.data;
  if (!isCheckedIn(guest)) {
    return NextResponse.json({ ok: true, ignored: true, reason: "not_checked_in" });
  }

  if (expectedEventId && guestEventId(guest) !== expectedEventId) {
    return NextResponse.json({
      ok: true,
      ignored: true,
      reason: "other_event",
    });
  }

  const name = guestDisplayName(guest);
  const id = guestId(guest);
  if (!name || !id) {
    return NextResponse.json(
      { error: "Missing guest name or id" },
      { status: 400 },
    );
  }

  const bot = spawnBot({ id, name });
  return NextResponse.json({ ok: true, bot });
}
