import { createHmac, timingSafeEqual } from "crypto";

export type LumaTicket = {
  checked_in_at?: string | null;
};

/** Event object on a Luma `guest.updated` payload (`data.event`). */
export type LumaEventRef = {
  id?: string;
  api_id?: string;
};

export type LumaGuestPayload = {
  api_id?: string;
  id?: string;
  /** Present on the in-repo fixture. Official payloads use `event.id`. */
  event_api_id?: string;
  event?: LumaEventRef;
  user_name?: string | null;
  name?: string | null;
  user?: { name?: string | null };
  event_tickets?: LumaTicket[];
  checked_in_at?: string | null;
};

export type LumaWebhookBody = {
  type?: string;
  action?: string;
  data?: LumaGuestPayload;
};

export function verifyWebhookSignature(
  secret: string,
  signatureHeader: string | null,
  body: string,
): boolean {
  if (!secret || !signatureHeader) return false;

  const parts: Record<string, string> = {};
  for (const part of signatureHeader.split(",")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    parts[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }

  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  const ageSec = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSec) || ageSec > 300) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");

  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature);
  return (
    expectedBuf.length === actualBuf.length &&
    timingSafeEqual(expectedBuf, actualBuf)
  );
}

export function isGuestUpdated(body: LumaWebhookBody): boolean {
  const kind = body.type ?? body.action;
  return kind === "guest.updated";
}

export function isCheckedIn(guest: LumaGuestPayload | undefined): boolean {
  if (!guest) return false;
  if (guest.checked_in_at) return true;
  return (guest.event_tickets ?? []).some((t) => Boolean(t.checked_in_at));
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function guestDisplayName(guest: LumaGuestPayload | undefined): string {
  if (!guest) return "";
  return (
    text(guest.user_name) || text(guest.name) || text(guest.user?.name) || ""
  );
}

export function guestId(guest: LumaGuestPayload | undefined): string {
  if (!guest) return "";
  return text(guest.api_id) || text(guest.id);
}

/**
 * Event id used for the LUMA_EVENT_ID filter.
 * Official `guest.updated` bodies send `data.event.id` (`evt_…`).
 * `event_api_id` is the field the signed fixture and older notes use.
 */
export function guestEventId(guest: LumaGuestPayload | undefined): string {
  if (!guest) return "";
  return (
    text(guest.event?.id) ||
    text(guest.event?.api_id) ||
    text(guest.event_api_id)
  );
}
