import { listBots, resetBots, spawnBot } from "@/lib/bot-store";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ bots: await listBots() });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name =
    typeof body === "object" &&
    body !== null &&
    "name" in body &&
    typeof (body as { name: unknown }).name === "string"
      ? (body as { name: string }).name
      : "";

  const bot = await spawnBot({ name });
  if (!bot) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  return NextResponse.json({ bot }, { status: 201 });
}

export async function DELETE() {
  try {
    await resetBots();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Check-in reset failed" }, { status: 502 });
  }
}
