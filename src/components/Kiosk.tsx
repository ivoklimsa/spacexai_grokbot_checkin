"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { BotField } from "@/components/BotField";
import { DemoSpawn } from "@/components/DemoSpawn";

export function Kiosk() {
  const searchParams = useSearchParams();
  const demoVisible = useMemo(() => {
    const raw = searchParams.get("demo");
    if (raw === "0" || raw === "false") return false;
    return true;
  }, [searchParams]);

  return (
    <main className="relative h-dvh w-dvw overflow-hidden bg-[#07090f] text-white">
      <div className="stage-glow pointer-events-none absolute inset-0" />
      <div className="stage-grain pointer-events-none absolute inset-0 opacity-[0.35]" />

      <div className="pointer-events-none absolute left-5 top-5 z-30">
        <p className="font-[family-name:var(--font-display)] text-[1.35rem] font-semibold tracking-[-0.03em] text-white/90 sm:text-[1.6rem]">
          Grokbot Check-in
        </p>
        <p className="mt-0.5 text-[11px] uppercase tracking-[0.22em] text-white/35">
          Live arrivals
        </p>
      </div>

      <BotField />
      <DemoSpawn visible={demoVisible} />
    </main>
  );
}
