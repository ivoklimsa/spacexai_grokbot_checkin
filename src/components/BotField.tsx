"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { createBody, stepPhysics, type PhysicsBody } from "@/lib/physics";
import type { Bot } from "@/lib/types";

const AVATAR_SIZE = 92;
const HIT_RADIUS = 48;
const LABEL_CLEARANCE = 28;

type Props = {
  initialBots?: Bot[];
};

type HelloEvent = { type: "hello"; bots: Bot[] };
type SpawnEvent = { type: "spawn"; bot: Bot };
type ResetEvent = { type: "reset" };
type StreamPayload = HelloEvent | SpawnEvent | ResetEvent;

export function BotField({ initialBots = [] }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const bodiesRef = useRef<Map<string, PhysicsBody>>(new Map());
  const botsRef = useRef<Map<string, Bot>>(new Map());
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number>(0);
  const [, setTick] = useState(0);

  const [bots, setBots] = useState<Bot[]>(initialBots);

  const botMap = useMemo(() => {
    const map = new Map<string, Bot>();
    for (const bot of bots) map.set(bot.id, bot);
    botsRef.current = map;
    return map;
  }, [bots]);

  useEffect(() => {
    for (const bot of initialBots) {
      botsRef.current.set(bot.id, bot);
    }
  }, [initialBots]);

  const ensureBody = (id: string) => {
    if (bodiesRef.current.has(id)) return;
    const rect = stageRef.current?.getBoundingClientRect();
    const width = rect?.width ?? window.innerWidth;
    const height = rect?.height ?? window.innerHeight;
    // Leave room for the name label under the avatar.
    const usableHeight = Math.max(HIT_RADIUS * 2, height - LABEL_CLEARANCE);
    const body = createBody(
      id,
      width,
      usableHeight,
      HIT_RADIUS,
      Array.from(bodiesRef.current.values()),
    );
    bodiesRef.current.set(id, body);
  };

  const upsertBot = (bot: Bot) => {
    setBots((prev) => {
      if (prev.some((b) => b.id === bot.id)) return prev;
      return [...prev, bot];
    });
    ensureBody(bot.id);
  };

  useEffect(() => {
    for (const bot of bots) ensureBody(bot.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      source = new EventSource("/api/bots/stream");

      source.onmessage = (message) => {
        if (cancelled) return;
        try {
          const data = JSON.parse(message.data) as StreamPayload;
          if (data.type === "hello") {
            setBots(data.bots);
            for (const bot of data.bots) ensureBody(bot.id);
            const alive = new Set(data.bots.map((b) => b.id));
            for (const id of bodiesRef.current.keys()) {
              if (!alive.has(id)) bodiesRef.current.delete(id);
            }
          } else if (data.type === "spawn") {
            upsertBot(data.bot);
          } else if (data.type === "reset") {
            setBots([]);
            bodiesRef.current.clear();
          }
        } catch {
          // ignore malformed frames
        }
      };

      source.onerror = () => {
        source?.close();
        if (cancelled) return;
        retryTimer = setTimeout(connect, 1500);
      };
    };

    // Hydrate once in case SSE hello is delayed.
    void fetch("/api/bots")
      .then((r) => r.json())
      .then((data: { bots?: Bot[] }) => {
        if (cancelled || !data.bots) return;
        setBots(data.bots);
        for (const bot of data.bots) ensureBody(bot.id);
      })
      .catch(() => undefined);

    connect();

    return () => {
      cancelled = true;
      source?.close();
      if (retryTimer) clearTimeout(retryTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const loop = (ts: number) => {
      const last = lastTsRef.current || ts;
      const dt = Math.min(0.05, (ts - last) / 1000);
      lastTsRef.current = ts;

      const rect = stageRef.current?.getBoundingClientRect();
      const width = rect?.width ?? window.innerWidth;
      const height = rect?.height ?? window.innerHeight;
      const usableHeight = Math.max(HIT_RADIUS * 2, height - LABEL_CLEARANCE);

      const bodies = Array.from(bodiesRef.current.values());
      stepPhysics(bodies, width, usableHeight, dt);

      setTick((n) => (n + 1) % 1_000_000);
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    const onResize = () => {
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) return;
      const usableHeight = Math.max(HIT_RADIUS * 2, rect.height - LABEL_CLEARANCE);
      for (const body of bodiesRef.current.values()) {
        body.x = Math.min(Math.max(body.radius, body.x), rect.width - body.radius);
        body.y = Math.min(
          Math.max(body.radius, body.y),
          usableHeight - body.radius,
        );
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const rendered = Array.from(botMap.values());

  return (
    <div ref={stageRef} className="absolute inset-0 overflow-hidden">
      {rendered.map((bot) => {
        const body = bodiesRef.current.get(bot.id);
        if (!body) return null;
        const age = performance.now() - body.bornAt;
        const scale = Math.min(1, age / 320);
        const opacity = Math.min(1, age / 220);

        return (
          <div
            key={bot.id}
            className="pointer-events-none absolute"
            style={{
              left: body.x,
              top: body.y,
              width: AVATAR_SIZE,
              height: AVATAR_SIZE,
              transform: `translate(-50%, -50%) scale(${0.72 + scale * 0.28})`,
              opacity,
              willChange: "transform, left, top",
            }}
          >
            <Image
              src={bot.avatar}
              alt=""
              width={AVATAR_SIZE}
              height={AVATAR_SIZE}
              className="h-full w-full object-contain drop-shadow-[0_10px_24px_rgba(0,0,0,0.35)]"
              priority={false}
              unoptimized
            />
            <span className="absolute left-1/2 top-[calc(100%+2px)] w-[120px] -translate-x-1/2 truncate text-center text-[13px] font-medium tracking-wide text-white/90 [text-shadow:0_1px_8px_rgba(0,0,0,0.85)]">
              {bot.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}
