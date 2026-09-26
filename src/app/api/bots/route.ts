import { NextResponse } from "next/server";
import { listBots, resetBots, spawnBot } from "@/lib/bot-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ bots: listBots() });
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

  const bot = spawnBot({ name });
  if (!bot) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  return NextResponse.json({ bot }, { status: 201 });
}

export async function DELETE() {
  resetBots();
  return NextResponse.json({ ok: true });
}
