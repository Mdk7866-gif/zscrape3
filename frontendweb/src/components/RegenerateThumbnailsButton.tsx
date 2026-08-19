"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { apiFetch, asFriendlyError } from "@/lib/api";
import { useAdmin } from "@/components/AdminContext";
import AlertMessagePopUp from "@/components/AlertMessagePopUp";

/**
 * Navbar action that repairs expired Instagram/Facebook thumbnails.
 *
 * Meta's CDN thumbnail URLs are signed and expire after ~4.5 days, so cards for
 * those two platforms eventually go blank. This re-extracts a fresh URL and has
 * the backend store the image bytes permanently, so each video needs it at most
 * once. Everything else (YouTube, Reddit, Twitter) uses non-expiring URLs and is
 * never touched.
 *
 * Rendered from the global Navbar, so it must hide itself off folder pages —
 * and stay hidden when the folder has no Instagram/Facebook videos at all,
 * rather than offering an action that would do nothing.
 */

/** Broadcast so the folder page can refetch without a full reload. */
export const THUMBNAILS_UPDATED_EVENT = "zscrape:thumbnails-updated";

function useFolderIdFromRoute(): string | null {
  const pathname = usePathname();
  const match = pathname?.match(/^\/folder\/([^/]+)/);
  return match ? match[1] : null;
}

export default function RegenerateThumbnailsButton() {
  const folderId = useFolderIdFromRoute();
  const { isAdmin, checking } = useAdmin();

  // Tagged with the folder it describes rather than reset on navigation, so the
  // effect never has to call setState synchronously just to clear a stale count.
  const [status, setStatus] = useState<{
    folderId: string;
    expired: number;
    total: number;
  } | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Navigating away mid-run would otherwise leave the request streaming with
  // nobody to receive it.
  useEffect(() => () => abortRef.current?.abort(), []);

  const refreshStatus = useCallback(async () => {
    if (!folderId) return;
    try {
      const res = await apiFetch(`/video/thumbnail-status?folder_id=${folderId}`);
      if (!res.ok) return;
      const data = await res.json();
      setStatus({ folderId, expired: data.expired ?? 0, total: data.total ?? 0 });
    } catch {
      // A status check is advisory — a failure here just means the button
      // stays hidden. The real errors surface when the user actually clicks.
    }
  }, [folderId]);

  // `isAdmin` is in the deps and `checking` gates the call: without both, the
  // first paint after a reload queries the wrong workspace.
  useEffect(() => {
    if (checking) return;
    // Deliberately not awaited in the effect body: the state update happens in
    // the async continuation, and a response arriving after the user has moved
    // to another folder is discarded by the folderId tag below rather than by
    // an abort.
    void (async () => {
      await refreshStatus();
    })();
  }, [isAdmin, checking, refreshStatus]);

  // Ignore counts belonging to a folder the user has already navigated away from.
  const current = status?.folderId === folderId ? status : null;
  const expired = current?.expired ?? 0;
  const total = current?.total ?? 0;

  const handleCancel = () => {
    // Aborting drops the connection, which the backend notices and uses to stop
    // queueing further work. Videos already finished keep their new thumbnails —
    // each one is written to the DB as it completes, not batched at the end.
    abortRef.current?.abort();
  };

  const handleClick = async () => {
    if (!folderId || running) return;
    setRunning(true);
    setProgress({ done: 0, total: expired });

    const controller = new AbortController();
    abortRef.current = controller;

    // Counted from the progress events rather than the final summary, because a
    // cancelled run never receives a "complete" event — but the work it already
    // did still stands and should be reported.
    let updatedSoFar = 0;
    let failedSoFar = 0;

    try {
      const res = await apiFetch("/video/regenerate-thumbnails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder_id: folderId }),
        signal: controller.signal,
      });
      if (res.status === 404) throw new Error("This folder is not available.");
      if (!res.ok) throw new Error("Could not regenerate thumbnails.");
      if (!res.body) throw new Error("No response from the server.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // NDJSON: one JSON object per line, so a long run reports as it goes.
      // A chunk boundary can split a line, hence the retained buffer.
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          let event;
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }
          if (event.type === "start") {
            setProgress({ done: 0, total: event.total });
          } else if (event.type === "progress") {
            setProgress({ done: event.processed, total: event.total });
            if (event.status === "updated") updatedSoFar += 1;
            else if (event.status === "failed") failedSoFar += 1;
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }
      }

      finish(updatedSoFar, failedSoFar, false);
    } catch (err) {
      // A cancel is a normal outcome, not a failure — report what got done.
      if (controller.signal.aborted) {
        finish(updatedSoFar, failedSoFar, true);
      } else {
        setAlert({
          title: "Couldn't regenerate thumbnails",
          message: asFriendlyError(err).message,
        });
      }
    } finally {
      abortRef.current = null;
      setRunning(false);
    }
  };

  /** Shared ending for both a completed and a cancelled run. */
  const finish = (updated: number, failed: number, cancelled: boolean) => {
    if (updated > 0) {
      window.dispatchEvent(new CustomEvent(THUMBNAILS_UPDATED_EVENT));
    }
    void refreshStatus();

    if (cancelled) {
      setAlert({
        title: "Stopped",
        message:
          updated > 0
            ? `Stopped early. The ${updated} thumbnail${updated === 1 ? "" : "s"} already restored ${updated === 1 ? "is" : "are"} saved — the rest were left as they were.`
            : "Stopped before any thumbnail finished. Nothing was changed.",
      });
      return;
    }

    setAlert({
      title: updated > 0 ? "Thumbnails restored" : "Nothing to restore",
      message:
        updated === 0 && failed === 0
          ? "All Instagram and Facebook thumbnails in this folder are already up to date."
          : `Restored ${updated} thumbnail${updated === 1 ? "" : "s"}.` +
            (failed > 0
              ? ` ${failed} could not be recovered — those posts may have been deleted or made private.`
              : ""),
    });
  };

  // Nothing to offer: not on a folder page, or no Instagram/Facebook videos here.
  if (!folderId || checking || total === 0) return null;
  // Everything is already permanent — don't invite a pointless Instagram round trip.
  if (expired === 0 && !running) return null;

  return (
    <>
      <button
        onClick={handleClick}
        disabled={running}
        title={
          running
            ? "Regenerating expired thumbnails…"
            : `${expired} Instagram/Facebook thumbnail${expired === 1 ? " has" : "s have"} expired — click to restore`
        }
        aria-label="Regenerate expired thumbnails"
        className="flex h-[34px] items-center justify-center gap-1.5 rounded-lg border border-warn-line bg-warn-soft px-2.5 text-xs font-semibold text-warn transition-colors hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-70"
      >
        <RefreshIcon className={`h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} />
        {/* Tabular numerals + a fixed-width slot keep the navbar from
            reflowing as the counter ticks up during a run. */}
        <span className="hidden tabular-nums sm:inline">
          {running
            ? `${progress.done}/${progress.total || expired}`
            : `Fix ${expired} thumbnail${expired === 1 ? "" : "s"}`}
        </span>
      </button>

      {/* Only while running, so the navbar isn't carrying a dead control the
          rest of the time. Sits outside the progress button because that one is
          disabled mid-run and a disabled button can't receive the click. */}
      {running && (
        <button
          onClick={handleCancel}
          title="Stop regenerating — thumbnails already restored are kept"
          aria-label="Stop regenerating thumbnails"
          className="flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-line bg-surface text-muted transition-colors hover:border-danger-line hover:bg-danger-soft hover:text-danger"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}

      {alert && (
        <AlertMessagePopUp
          title={alert.title}
          message={alert.message}
          onClose={() => setAlert(null)}
        />
      )}
    </>
  );
}

function RefreshIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <polyline points="21 3 21 9 15 9" />
    </svg>
  );
}
