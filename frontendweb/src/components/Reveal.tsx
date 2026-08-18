"use client";

import { useEffect, useRef, useState, ReactNode, ElementType } from "react";

interface RevealProps {
  children: ReactNode;
  /** Stagger, in ms, applied via CSS custom property (no extra renders). */
  delay?: number;
  className?: string;
  as?: ElementType;
}

/**
 * Fades + lifts its children in when they scroll into view.
 *
 * Purely cosmetic, and deliberately CLS-free: the element occupies its final
 * box from first paint — only `opacity` and `transform` animate, neither of
 * which affects layout. `prefers-reduced-motion` flattens it (see globals.css).
 */
export default function Reveal({
  children,
  delay = 0,
  className = "",
  as: Tag = "div",
}: RevealProps) {
  const ref = useRef<HTMLElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    // Older browsers (and anything without the API) get the content outright
    // rather than a permanently invisible page.
    if (!el || typeof IntersectionObserver === "undefined") {
      setRevealed(true);
      return;
    }

    // Already on screen at mount (above the fold) — skip the observer entirely
    // so the hero doesn't wait a frame to appear.
    if (el.getBoundingClientRect().top < window.innerHeight) {
      setRevealed(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setRevealed(true);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      data-revealed={revealed}
      className={`reveal ${className}`}
      style={{ "--reveal-delay": `${delay}ms` } as React.CSSProperties}
    >
      {children}
    </Tag>
  );
}
