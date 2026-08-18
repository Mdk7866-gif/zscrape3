"use client";

import { useRef, ReactNode } from "react";

/**
 * Feature card with a soft glow that tracks the cursor.
 *
 * The pointer position is written straight to CSS custom properties rather than
 * to React state — a mousemove handler that re-renders would repaint the whole
 * feature grid on every frame.
 */
export default function SpotlightCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - rect.left}px`);
    el.style.setProperty("--my", `${e.clientY - rect.top}px`);
  };

  return (
    <div
      ref={ref}
      onPointerMove={onPointerMove}
      className={`group card-glow relative overflow-hidden rounded-2xl border border-line bg-surface/80 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-accent/10 ${className}`}
    >
      {/* Cursor spotlight — fades in on hover, sits under the content. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(220px circle at var(--mx, 50%) var(--my, 50%), var(--glow-1), transparent 70%)",
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}
