"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { SpawnCloud } from "@/components/SpawnCloud";
import { createBody, stepPhysics, type PhysicsBody } from "@/lib/physics";
import type { Bot } from "@/lib/types";

const AVATAR_SIZE = 92;
const HIT_RADIUS = 48;
const LABEL_CLEARANCE = 28;

/** Cloud pops in, holds, then crossfades into the grok avatar. */
const CLOUD_IN_MS = 420;
const CLOUD_HOLD_MS = 320;
const REVEAL_MS = 520;
const INTRO_TOTAL_MS = CLOUD_IN_MS + CLOUD_HOLD_MS + REVEAL_MS;

type Props = {
  initialBots?: Bot[];
};

type HelloEvent = { type: "hello"; bots: Bot[] };
type SpawnEvent = { type: "spawn"; bot: Bot };
type ResetEvent = { type: "reset" };
type StreamPayload = HelloEvent | SpawnEvent | ResetEvent;

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

function easeOutBack(t: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

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

  const ensureBody = (id: string, options?: { animate?: boolean }) => {
    if (bodiesRef.current.has(id)) return;
    const rect = stageRef.current?.getBoundingClientRect();
    const width = rect?.width ?? window.innerWidth;
    const height = rect?.height ?? window.innerHeight;
    const usableHeight = Math.max(HIT_RADIUS * 2, height - LABEL_CLEARANCE);
    const body = createBody(
      id,
      width,
      usableHeight,
      HIT_RADIUS,
      Array.from(bodiesRef.current.values()),
    );
    // Hydrated bots skip the cloud intro.
    if (options?.animate === false) {
      body.bornAt = performance.now() - INTRO_TOTAL_MS - 100;
    }
    bodiesRef.current.set(id, body);
  };

  const upsertBot = (bot: Bot) => {
    setBots((prev) => {
      if (prev.some((b) => b.id === bot.id)) return prev;
      return [...prev, bot];
    });
    ensureBody(bot.id, { animate: true });
  };

  useEffect(() => {
    for (const bot of bots) ensureBody(bot.id, { animate: false });
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
            for (const bot of data.bots) ensureBody(bot.id, { animate: false });
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

    void fetch("/api/bots")
      .then((r) => r.json())
      .then((data: { bots?: Bot[] }) => {
        if (cancelled || !data.bots) return;
        setBots(data.bots);
        for (const bot of data.bots) ensureBody(bot.id, { animate: false });
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
        const cloudIn = easeOutBack(clamp01(age / CLOUD_IN_MS));
        const inHold = age > CLOUD_IN_MS;
        const holdAge = Math.max(0, age - CLOUD_IN_MS);
        const pulse =
          inHold && age < CLOUD_IN_MS + CLOUD_HOLD_MS
            ? Math.sin((holdAge / CLOUD_HOLD_MS) * Math.PI) * 0.35
            : 0;
        const revealT = easeOutCubic(
          clamp01((age - CLOUD_IN_MS - CLOUD_HOLD_MS * 0.35) / REVEAL_MS),
        );
        const cloudFade = clamp01(
          (age - CLOUD_IN_MS - CLOUD_HOLD_MS * 0.2) / (REVEAL_MS * 0.85),
        );
        const showCloud = age < INTRO_TOTAL_MS && cloudFade < 1;
        const grokScale = 0.55 + revealT * 0.45;
        const grokOpacity = revealT;
        const nameOpacity = clamp01((revealT - 0.35) / 0.65);

        return (
          <div
            key={bot.id}
            className="pointer-events-none absolute"
            style={{
              left: body.x,
              top: body.y,
              width: AVATAR_SIZE,
              height: AVATAR_SIZE,
              transform: "translate(-50%, -50%)",
              willChange: "transform, left, top",
            }}
          >
            {showCloud && (
              <SpawnCloud appear={cloudIn} fadeOut={cloudFade} pulse={pulse} />
            )}

            <div
              className="absolute inset-0"
              style={{
                transform: `scale(${grokScale})`,
                opacity: grokOpacity,
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
            </div>

            <span
              className="absolute left-1/2 top-[calc(100%+2px)] w-[120px] -translate-x-1/2 truncate text-center text-[13px] font-medium tracking-wide text-white/90 [text-shadow:0_1px_8px_rgba(0,0,0,0.85)]"
              style={{ opacity: nameOpacity }}
            >
              {bot.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}
