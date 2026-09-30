import {
  listBots,
  reconcileFromDatabase,
  subscribe,
} from "@/lib/bot-store";
import { isDatabaseConfigured } from "@/lib/db";
import type { StreamEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** How often an open SSE connection re-reads Neon for cross-instance spawns. */
const RECONCILE_MS = 2000;

export async function GET() {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let reconcileTimer: ReturnType<typeof setInterval> | undefined;
  let knownIds = new Set<string>();
  let closed = false;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    unsubscribe?.();
    if (heartbeat) clearInterval(heartbeat);
    if (reconcileTimer) clearInterval(reconcileTimer);
  };

  const stream = new ReadableStream({
    start(controller) {
      const send = (
        event:
          | StreamEvent
          | { type: "hello"; bots: Awaited<ReturnType<typeof listBots>> },
      ) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        } catch {
          cleanup();
        }
      };

      void listBots()
        .then((bots) => {
          if (closed) return;
          knownIds = new Set(bots.map((b) => b.id));
          send({ type: "hello", bots });
        })
        .catch(() => {
          if (closed) return;
          send({ type: "hello", bots: [] });
        });

      unsubscribe = subscribe((event) => {
        if (event.type === "spawn") {
          knownIds.add(event.bot.id);
        } else if (event.type === "reset") {
          knownIds = new Set();
        }
        send(event);
      });

      heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          cleanup();
        }
      }, 15000);

      if (isDatabaseConfigured()) {
        reconcileTimer = setInterval(() => {
          void reconcileFromDatabase(knownIds).then((result) => {
            if (closed) return;
            knownIds = result.knownIds;
            for (const event of result.events) {
              send(event);
            }
          });
        }, RECONCILE_MS);
      }
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
