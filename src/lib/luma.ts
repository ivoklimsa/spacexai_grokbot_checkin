import { createHmac, timingSafeEqual } from "crypto";

export type LumaTicket = {
  checked_in_at?: string | null;
};

export type LumaGuestPayload = {
  api_id?: string;
  id?: string;
  event_api_id?: string;
  user_name?: string;
  name?: string;
  user?: { name?: string };
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
    parts[part.slice(0, idx)] = part.slice(idx + 1);
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

export function guestDisplayName(guest: LumaGuestPayload | undefined): string {
  if (!guest) return "";
  return (
    guest.user_name?.trim() ||
    guest.name?.trim() ||
    guest.user?.name?.trim() ||
    ""
  );
}

export function guestId(guest: LumaGuestPayload | undefined): string {
  if (!guest) return "";
  return guest.api_id?.trim() || guest.id?.trim() || "";
}

export function guestEventId(guest: LumaGuestPayload | undefined): string {
  if (!guest) return "";
  return guest.event_api_id?.trim() || "";
}
