"use client";

import { useEffect, useRef, useState } from "react";
import PlatformBadge from "@/components/PlatformBadge";
import { PLATFORMS } from "@/lib/platforms";

/* The three beats of the product loop: paste → extract → download. */
const STAGES = ["paste", "extract", "download"] as const;
type Stage = (typeof STAGES)[number];

const STAGE_MS: Record<Stage, number> = {
  paste: 4200,
  extract: 3400,
  download: 5200,
};

const MESSY_TEXT = `hey check these out
youtube.com/watch?v=dQw4w9WgXcQ
also https://x.com/i/status/1789 (broken?)
insta reel > instagram.com/reel/C8xKq2
reddit.com/r/videos/s/9fKm2
...and this one facebook.com/watch/?v=7781`;

const byName = (name: string) => PLATFORMS.find((p) => p.name === name)!;

const EXTRACTED = [
  { platform: byName("YouTube"), url: "youtube.com/watch?v=dQw4w9WgXcQ" },
  { platform: byName("X / Twitter"), url: "x.com/i/status/1789" },
  { platform: byName("Instagram"), url: "instagram.com/reel/C8xKq2" },
  { platform: byName("Reddit"), url: "reddit.com/r/videos/s/9fKm2" },
  { platform: byName("Facebook"), url: "facebook.com/watch/?v=7781" },
];

const DOWNLOADS = [
  { title: "Never Gonna Give You Up", meta: "3:32 · 48.2 MB", pct: 100, dur: 1.6, platform: byName("YouTube") },
  { title: "Launch teaser — final cut", meta: "0:44 · 12.8 MB", pct: 100, dur: 2.4, platform: byName("X / Twitter") },
  { title: "Behind the scenes reel", meta: "1:07 · 22.4 MB", pct: 72, dur: 3.4, platform: byName("Instagram") },
  { title: "r/videos — best of week", meta: "8:15 · 96.1 MB", pct: 41, dur: 4.2, platform: byName("Reddit") },
];

/**
 * Looping mock of the app doing its job, used as the hero visual.
 *
 * Every stage renders inside the same fixed-height frame, so the surrounding
 * page never reflows as the animation cycles — the hero's height is identical
 * at first paint and at every point in the loop.
 */
export default function HeroShowcase() {
  const [stage, setStage] = useState<Stage>("paste");
  const [typed, setTyped] = useState(0);
  const [reduced, setReduced] = useState(false);
  const stageRef = useRef<Stage>("paste");

  // Static end-state for anyone who asked for less motion.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      setReduced(mq.matches);
      if (mq.matches) {
        setStage("download");
        setTyped(MESSY_TEXT.length);
      }
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Stage cycler.
  useEffect(() => {
    if (reduced) return;
    stageRef.current = stage;
    const next = STAGES[(STAGES.indexOf(stage) + 1) % STAGES.length];
    const id = setTimeout(() => setStage(next), STAGE_MS[stage]);
    return () => clearTimeout(id);
  }, [stage, reduced]);

  // Typewriter for the paste stage. The reset-to-0 write is deferred a frame
  // so it lands in a callback rather than synchronously in the effect body.
  useEffect(() => {
    if (reduced) return;
    if (stage !== "paste") return;
    const resetId = requestAnimationFrame(() => setTyped(0));
    const id = setInterval(() => {
      setTyped((n) => {
        if (n >= MESSY_TEXT.length) {
          clearInterval(id);
          return n;
        }
        return n + 2;
      });
    }, 22);
    return () => {
      cancelAnimationFrame(resetId);
      clearInterval(id);
    };
  }, [stage, reduced]);

  const stageIndex = STAGES.indexOf(stage);

  return (
    <div className="relative">
      {/* Glow pooled under the window */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-6 rounded-[2rem] bg-gradient-to-tr from-accent/20 via-accent-2/15 to-accent-3/20 blur-2xl"
      />

      <div className="relative overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl shadow-black/10">
        {/* Title bar */}
        <div className="flex items-center gap-2 border-b border-line bg-surface-2/80 px-3 py-2.5 sm:px-4">
          <span className="flex gap-1.5" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-full bg-danger/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-warn/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-ok/70" />
          </span>
          <span className="ml-1 truncate font-mono text-[11px] text-subtle">
            zscrape / trip-videos
          </span>
          <span className="ml-auto flex items-center gap-1" aria-hidden>
            {STAGES.map((s, i) => (
              <span
                key={s}
                className={`h-1.5 rounded-full transition-all duration-500 ${
                  i === stageIndex ? "w-5 bg-accent" : "w-1.5 bg-line-strong"
                }`}
              />
            ))}
          </span>
        </div>

        {/* Fixed-height stage area — the whole point of the height lock is that
            switching stages can never change the hero's size. */}
        <div className="relative h-[290px] sm:h-[330px] lg:h-[350px]">
          {/* ── Stage 1: messy paste ── */}
          <StagePanel active={stage === "paste"}>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">
              <Dot /> Pasted text
            </div>
            <pre className="mt-3 flex-1 overflow-hidden whitespace-pre-wrap break-all rounded-xl border border-line bg-surface-2/70 p-3 font-mono text-[10.5px] leading-relaxed text-muted sm:text-[11.5px]">
              {MESSY_TEXT.slice(0, typed)}
              <span className="ml-px inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse bg-accent align-middle" />
            </pre>
          </StagePanel>

          {/* ── Stage 2: AI extraction ── */}
          <StagePanel active={stage === "extract"}>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-accent">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
              </span>
              GPT-4o extracting URLs
            </div>
            <ul className="mt-3 space-y-1.5">
              {EXTRACTED.map((item, i) => (
                <li
                  key={item.url}
                  className="flex items-center gap-2 rounded-lg border border-line bg-surface-2/60 px-2.5 py-1.5 opacity-0"
                  style={{
                    animation: `pop-in .34s cubic-bezier(.34,1.4,.64,1) ${i * 0.14 + 0.1}s both`,
                  }}
                >
                  <PlatformBadge platform={item.platform} size="sm" />
                  <span className="truncate font-mono text-[10.5px] text-muted sm:text-[11px]">
                    {item.url}
                  </span>
                  <span className="ml-auto shrink-0 rounded-full border border-line px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-subtle">
                    {item.platform.name}
                  </span>
                </li>
              ))}
            </ul>
          </StagePanel>

          {/* ── Stage 3: downloading ── */}
          <StagePanel active={stage === "download"}>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">
              <Dot className="bg-ok" /> Downloading · best quality
            </div>
            <ul className="mt-3 space-y-2">
              {DOWNLOADS.map((d, i) => (
                <li
                  key={d.title}
                  className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-2/60 p-2 opacity-0"
                  style={{
                    animation: `pop-in .3s cubic-bezier(.34,1.4,.64,1) ${i * 0.1}s both`,
                  }}
                >
                  <span
                    className="grid h-9 w-14 shrink-0 place-items-center rounded-md"
                    style={{ background: d.platform.color }}
                    aria-hidden
                  >
                    <d.platform.Icon className="h-4 w-4 text-white" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="clamp-1 text-[11.5px] font-semibold text-fg">{d.title}</p>
                    <p className="font-mono text-[9.5px] text-subtle">{d.meta}</p>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-line">
                      <span
                        className="block h-full origin-left rounded-full bg-gradient-to-r from-accent to-accent-2"
                        style={{
                          transform: `scaleX(${d.pct / 100})`,
                          animation: reduced
                            ? undefined
                            : `progress-fill ${d.dur}s cubic-bezier(.4,0,.2,1) ${i * 0.12}s both`,
                        }}
                      />
                    </div>
                  </div>
                  <span
                    className={`shrink-0 font-mono text-[10px] tabular-nums ${
                      d.pct === 100 ? "text-ok" : "text-subtle"
                    }`}
                  >
                    {d.pct === 100 ? "✓" : `${d.pct}%`}
                  </span>
                </li>
              ))}
            </ul>
          </StagePanel>
        </div>
      </div>
    </div>
  );
}

/** One absolutely-positioned stage; only opacity/transform animate. */
function StagePanel({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <div
      aria-hidden={!active}
      className={`absolute inset-0 flex flex-col p-3 transition-all duration-500 sm:p-4 ${
        active
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-2 opacity-0"
      }`}
    >
      {children}
    </div>
  );
}

function Dot({ className = "bg-accent" }: { className?: string }) {
  return <span className={`inline-block h-2 w-2 rounded-full ${className}`} />;
}
