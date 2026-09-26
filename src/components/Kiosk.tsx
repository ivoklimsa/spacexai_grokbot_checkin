"use client";

import Image from "next/image";
import { useRef } from "react";
import { BotField } from "@/components/BotField";
import { DemoSpawn } from "@/components/DemoSpawn";

type Props = {
  /** Spawn controls and S / shortcuts. Only the `/demo` route sets this. */
  demo?: boolean;
};

export function Kiosk({ demo = false }: Props) {
  const lockupRef = useRef<HTMLDivElement>(null);

  return (
    <main className="relative h-dvh w-dvw overflow-hidden bg-[#07090f] text-white">
      <div className="stage-glow pointer-events-none absolute inset-0" />
      <div className="stage-grain pointer-events-none absolute inset-0 opacity-[0.35]" />

      <div
        ref={lockupRef}
        data-brand-lockup=""
        className="pointer-events-none absolute left-5 top-5 z-30 flex items-center gap-3"
      >
        <Image
          src="/brand/spacexai-logo.png"
          alt="SpaceXAi"
          width={834}
          height={318}
          priority
          unoptimized
          className="h-11 w-auto object-contain object-left drop-shadow-[0_2px_14px_rgba(0,0,0,0.5)] sm:h-12"
        />
        <div className="flex flex-col items-start leading-tight">
          <p className="font-[family-name:var(--font-display)] text-[1.15rem] font-semibold tracking-[-0.02em] text-white/95 sm:text-[1.35rem]">
            SpaceXAi Check-in
          </p>
          <p className="mt-0.5 text-[11px] uppercase tracking-[0.22em] text-white/35">
            Live arrivals
          </p>
        </div>
      </div>

      <BotField lockupRef={lockupRef} />
      {demo ? <DemoSpawn visible /> : null}
    </main>
  );
}
