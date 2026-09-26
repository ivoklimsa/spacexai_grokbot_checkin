"use client";

import { useEffect, useRef, useState } from "react";
import {
  clearPersistedBots,
  loadBots,
  mergeBots,
} from "@/lib/bot-persistence";
import type { Bot } from "@/lib/types";

type HelloEvent = { type: "hello"; bots: Bot[] };
type SpawnEvent = { type: "spawn"; bot: Bot };
type ResetEvent = { type: "reset" };
type StreamPayload = HelloEvent | SpawnEvent | ResetEvent;

function formatRegisteredAt(createdAt: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(createdAt);
}

export function AdminBoard() {
  const [bots, setBots] = useState<Bot[] | null>(null);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listEpoch = useRef(0);

  useEffect(() => {
    const epochAtStart = listEpoch.current;
    let cancelled = false;
    let helloCount = 0;
    const source = new EventSource("/api/bots/stream");

    const applyServerList = (incoming: Bot[]) => {
      if (cancelled || listEpoch.current !== epochAtStart) return;
      setBots(mergeBots(loadBots(), incoming));
    };

    void fetch("/api/bots", { cache: "no-store" })
      .then((response) => response.json() as Promise<{ bots?: Bot[] }>)
      .then((data) => {
        applyServerList(data.bots ?? []);
      })
      .catch(() => {
        if (cancelled || listEpoch.current !== epochAtStart) return;
        setBots(loadBots());
      });

    source.onmessage = (message) => {
      if (cancelled) return;
      try {
        const data = JSON.parse(message.data) as StreamPayload;
        if (data.type === "hello") {
          helloCount += 1;
          if (helloCount === 1 && listEpoch.current !== epochAtStart) return;
          setBots(mergeBots(loadBots(), data.bots));
        } else if (data.type === "spawn") {
          setBots((prev) => mergeBots(prev ?? loadBots(), [data.bot]));
        } else if (data.type === "reset") {
          listEpoch.current += 1;
          clearPersistedBots();
          setBots([]);
        }
      } catch {
        // Ignore malformed frames.
      }
    };

    return () => {
      cancelled = true;
      source.close();
    };
  }, []);

  async function resetField() {
    listEpoch.current += 1;
    setResetting(true);
    setError(null);
    try {
      const response = await fetch("/api/bots", { method: "DELETE" });
      if (!response.ok) {
        throw new Error("Reset failed");
      }
      clearPersistedBots();
      setBots([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
      try {
        const data = (await fetch("/api/bots", { cache: "no-store" }).then((r) =>
          r.json(),
        )) as { bots?: Bot[] };
        setBots(mergeBots(loadBots(), data.bots ?? []));
      } catch {
        setBots(loadBots());
      }
    } finally {
      setResetting(false);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
          Check-ins
        </h1>
        <button
          type="button"
          onClick={() => void resetField()}
          disabled={resetting}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
        >
          {resetting ? "Resetting…" : "Reset"}
        </button>
      </header>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {bots === null ? (
        <p className="text-sm text-zinc-500">Loading check-ins…</p>
      ) : bots.length === 0 ? (
        <p>No check-ins yet</p>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-300 text-zinc-500">
              <th scope="col" className="py-2 pr-4 font-medium">
                Name
              </th>
              <th scope="col" className="py-2 font-medium">
                Registered at
              </th>
            </tr>
          </thead>
          <tbody>
            {bots.map((bot) => (
              <tr key={bot.id} className="border-b border-zinc-200">
                <td className="py-3 pr-4">{bot.name}</td>
                <td className="py-3 tabular-nums">
                  {formatRegisteredAt(bot.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
