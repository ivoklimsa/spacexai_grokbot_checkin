"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { randomSampleName } from "@/lib/sample-names";

type Props = {
  visible: boolean;
};

export function DemoSpawn({ visible }: Props) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const spawn = useCallback(async (overrideName?: string) => {
    const nextName = (overrideName ?? name).trim() || randomSampleName();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nextName }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error || "Failed to spawn");
      }
      setName("");
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to spawn");
    } finally {
      setBusy(false);
    }
  }, [name]);

  useEffect(() => {
    if (!visible) return;

    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if (event.key === "s" || event.key === "S" || event.key === "/") {
        if (typing) return;
        event.preventDefault();
        setOpen(true);
        queueMicrotask(() => inputRef.current?.focus());
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2">
      {open && (
        <form
          className="pointer-events-auto flex w-[min(90vw,22rem)] flex-col gap-2 rounded-2xl border border-white/15 bg-[#12151c]/92 px-3 py-3 shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur-md"
          onSubmit={(e) => {
            e.preventDefault();
            void spawn();
          }}
        >
          <label className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/45">
            Spawn grokbot
          </label>
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Person name (blank = random)"
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#7dd3c7]/60"
          />
          {error && <p className="text-xs text-rose-300">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="flex-1 rounded-xl bg-[#7dd3c7] px-3 py-2 text-sm font-semibold text-[#0b1210] transition hover:bg-[#9be3d8] disabled:opacity-60"
            >
              {busy ? "Spawning…" : "Spawn"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void spawn(randomSampleName())}
              className="rounded-xl border border-white/15 px-3 py-2 text-sm text-white/80 transition hover:bg-white/5"
            >
              Random
            </button>
          </div>
        </form>
      )}

      <button
        type="button"
        className="pointer-events-auto rounded-full border border-white/15 bg-[#12151c]/85 px-4 py-2 text-sm font-medium text-white/90 shadow-lg backdrop-blur-md transition hover:border-[#7dd3c7]/50 hover:text-white"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Close" : "+ Spawn"}
      </button>
      <p className="pointer-events-none text-[10px] tracking-wide text-white/35">
        Press S or /
      </p>
    </div>
  );
}
