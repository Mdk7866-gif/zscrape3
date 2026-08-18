"use client";

import { useEffect, useRef } from "react";

/** How many modals are currently open — nested popups must not fight over the lock. */
let openModals = 0;

/**
 * Shared modal behaviour: Escape to dismiss, background scroll lock, and a
 * focus trap that returns focus where it came from on close.
 *
 * Every popup in the app used to re-implement (or skip) these; the ones that
 * skipped them let you tab into the page behind the overlay and scroll it.
 *
 * The scroll lock is refcounted because popups stack — FailedUrls opens a
 * confirmation on top of itself, and the inner one closing must not unlock the
 * page while the outer one is still up.
 */
export function useModal<T extends HTMLElement>(onDismiss?: () => void) {
  const ref = useRef<T>(null);
  // Kept in a ref so a caller passing an inline arrow doesn't re-run the main
  // effect (and re-take the scroll lock) on every render. Written from its own
  // effect rather than during render — mutating a ref while rendering is only
  // safe for refs nothing reads until after commit, and it's cheap enough here
  // to just not take the risk.
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  });

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;

    openModals += 1;
    // `scrollbar-gutter: stable` on <html> (globals.css) keeps the scrollbar
    // track reserved, so locking here doesn't shift the page sideways.
    if (openModals === 1) document.documentElement.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        dismissRef.current?.();
        return;
      }
      if (e.key !== "Tab" || !ref.current) return;

      const focusables = ref.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      // Wrap around instead of letting focus escape to the page behind.
      if (e.shiftKey && (active === first || !ref.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      openModals = Math.max(0, openModals - 1);
      if (openModals === 0) document.documentElement.style.overflow = "";
      previouslyFocused?.focus?.();
    };
  }, []);

  return ref;
}
