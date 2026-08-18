"use client";

import { useEffect, useRef, useState } from "react";

interface CountUpProps {
  to: number;
  /** Animation length in ms. */
  duration?: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
}

/**
 * Counts from 0 up to `to` the first time it scrolls into view.
 *
 * The box is sized from the *final* value (min-width in `ch`, tabular figures),
 * so the digits changing width mid-animation can't reflow the row around it.
 */
export default function CountUp({
  to,
  duration = 1400,
  suffix = "",
  prefix = "",
  decimals = 0,
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Respect reduced motion: land on the final number immediately. Deferred a
    // frame so the state write happens in a callback rather than synchronously
    // in the effect body.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof IntersectionObserver === "undefined") {
      const id = requestAnimationFrame(() => setValue(to));
      return () => cancelAnimationFrame(id);
    }

    let frame = 0;
    const run = () => {
      if (started.current) return;
      started.current = true;
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        // easeOutExpo — fast start, gentle settle
        const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
        setValue(to * eased);
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          run();
          observer.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [to, duration]);

  const finalText = `${prefix}${to.toFixed(decimals)}${suffix}`;

  return (
    <span
      ref={ref}
      className="inline-block tabular-nums"
      style={{ minWidth: `${finalText.length}ch` }}
    >
      {prefix}
      {value.toFixed(decimals)}
      {suffix}
    </span>
  );
}
