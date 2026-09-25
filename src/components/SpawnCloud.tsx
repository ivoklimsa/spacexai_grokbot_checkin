"use client";

type Props = {
  /** 0..1 appearance progress for the cloud itself */
  appear: number;
  /** 0..1 fade-out as the grok reveals */
  fadeOut: number;
  /** Soft pulse during hold */
  pulse: number;
};

/** Soft white puff used as the spawn “portal” before the grok appears. */
export function SpawnCloud({ appear, fadeOut, pulse }: Props) {
  const scale = 0.15 + appear * 0.95 + pulse * 0.08;
  const opacity = Math.max(0, appear * (1 - fadeOut));

  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{
        transform: `scale(${scale})`,
        opacity,
        filter: `blur(${fadeOut * 6}px)`,
      }}
      aria-hidden
    >
      <svg
        viewBox="0 0 120 80"
        className="h-[78%] w-[90%] drop-shadow-[0_8px_20px_rgba(255,255,255,0.25)]"
      >
        <ellipse cx="42" cy="48" rx="28" ry="20" fill="rgba(255,255,255,0.92)" />
        <ellipse cx="68" cy="44" rx="32" ry="24" fill="rgba(255,255,255,0.95)" />
        <ellipse cx="90" cy="50" rx="22" ry="16" fill="rgba(255,255,255,0.9)" />
        <ellipse cx="55" cy="30" rx="24" ry="18" fill="rgba(255,255,255,0.97)" />
        <ellipse cx="30" cy="38" rx="16" ry="12" fill="rgba(255,255,255,0.88)" />
      </svg>

      {/* Tiny puff sparks */}
      {[0, 1, 2, 3].map((i) => {
        const angle = (i / 4) * Math.PI * 2 + appear * 0.8;
        const dist = 28 + appear * 22 + pulse * 6;
        const x = Math.cos(angle) * dist;
        const y = Math.sin(angle) * dist * 0.7;
        return (
          <span
            key={i}
            className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80"
            style={{
              transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${0.4 + appear * 0.8})`,
              opacity: Math.max(0, appear * 0.9 * (1 - fadeOut)),
            }}
          />
        );
      })}
    </div>
  );
}
