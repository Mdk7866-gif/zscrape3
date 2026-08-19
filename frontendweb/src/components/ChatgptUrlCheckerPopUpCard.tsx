"use client";

import { useState, ReactNode } from "react";
import AlertMessagePopUp from "@/components/AlertMessagePopUp";
import { apiFetch, asFriendlyError } from "@/lib/api";
import { useModal } from "@/lib/useModal";

interface ChatgptUrlCheckerPopUpCardProps {
  folderId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const MAX_LINES = 100;
const MAX_CHARS = 20000;
const MAX_URLS_PER_BATCH = 50;

export default function ChatgptUrlCheckerPopUpCard({
  folderId,
  onClose,
  onSuccess,
}: ChatgptUrlCheckerPopUpCardProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [inputText, setInputText] = useState("");
  const [extractedUrls, setExtractedUrls] = useState<string[]>([]);
  const [remainingUrls, setRemainingUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState("");
  const [copiedRemaining, setCopiedRemaining] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [alert, setAlert] = useState<{
    title: string;
    message: string | ReactNode;
    type?: "success" | "error" | "warning" | "info";
  } | null>(null);

  // Don't let Escape close the dialog mid-upload — the request keeps running
  // and the user loses all feedback about it.
  const dialogRef = useModal<HTMLDivElement>(() => {
    if (!loading) onClose();
  });

  const lineCount = inputText ? inputText.split("\n").length : 0;
  const overLimit = lineCount > MAX_LINES || inputText.length > MAX_CHARS;

  const handleExtract = async () => {
    if (!inputText.trim()) return;

    if (lineCount > MAX_LINES) {
      setError(`Please paste a maximum of ${MAX_LINES} lines. You pasted ${lineCount}.`);
      return;
    }
    if (inputText.length > MAX_CHARS) {
      setError(
        `Text is too long (${inputText.length}/${MAX_CHARS} characters). Please paste a smaller batch.`
      );
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setStatusText("Extracting clean URLs with AI…");

      const chatRes = await apiFetch("/chatgpturlchecker/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: inputText }),
      });

      if (!chatRes.ok) throw new Error("Failed to process URLs with ChatGPT");

      const chatData = await chatRes.json();
      const allUrls: string[] = chatData.urls || [];

      if (allUrls.length === 0) throw new Error("No valid URLs found in the text.");

      if (allUrls.length > MAX_URLS_PER_BATCH) {
        const kept = allUrls.slice(0, MAX_URLS_PER_BATCH);
        const rest = allUrls.slice(MAX_URLS_PER_BATCH);
        setRemainingUrls(rest);
        setExtractedUrls(kept);
        // Counts are computed from `allUrls`, not from state that hasn't been
        // committed yet — the old version read the stale `remainingUrls` here
        // and reported the wrong total.
        setError(
          `Extracted ${allUrls.length} URLs, but only ${MAX_URLS_PER_BATCH} can be processed at a time. The first ${MAX_URLS_PER_BATCH} are loaded below — copy the remaining ${rest.length} to use next.`
        );
      } else {
        setRemainingUrls([]);
        setExtractedUrls(allUrls);
      }

      setStep(2);
    } catch (err) {
      setError(asFriendlyError(err).message);
    } finally {
      setLoading(false);
      setStatusText("");
    }
  };

  const handleBulkUpload = async () => {
    if (extractedUrls.length === 0) return;

    try {
      setLoading(true);
      setError(null);
      setStatusText("Starting upload…");
      setProgress(null);

      const bulkRes = await apiFetch("/video/bulk-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder_id: folderId, urls: extractedUrls }),
      });

      if (!bulkRes.ok) throw new Error("Failed to upload URLs to database");

      const reader = bulkRes.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      let saved = 0;
      let duplicates = 0;
      let failed = 0;

      for (;;) {
        const { value, done } = await reader.read();
        if (value) buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.type === "start") {
              setStatusText(`Preparing ${data.total} videos…`);
              setProgress({ done: 0, total: data.total });
            } else if (data.type === "progress") {
              setStatusText(`Adding videos… (${data.processed}/${data.total})`);
              setProgress({ done: data.processed, total: data.total });
            } else if (data.type === "complete") {
              saved = data.saved;
              duplicates = data.duplicates;
              failed = data.failed;
            }
          } catch {
            console.error("Failed to parse stream chunk", line);
          }
        }
        if (done) break;
      }

      setAlert({
        title: "Upload complete",
        message: (
          <div className="mt-1 flex flex-col gap-1.5">
            {saved > 0 && (
              <span className="font-medium text-ok">✅ Successfully added {saved} video(s).</span>
            )}
            {duplicates > 0 && (
              <span className="text-accent">ℹ️ Skipped {duplicates} duplicate URL(s).</span>
            )}
            {failed > 0 && (
              <span className="text-danger">
                ❌ {failed} URL(s) failed and moved to Failed URLs.
              </span>
            )}
          </div>
        ),
        type: failed > 0 ? "warning" : "success",
      });

      onSuccess();
    } catch (err) {
      setError(asFriendlyError(err).message);
    } finally {
      setLoading(false);
      setStatusText("");
      setProgress(null);
    }
  };

  const copyRemaining = async () => {
    try {
      await navigator.clipboard.writeText(remainingUrls.join("\n"));
      setCopiedRemaining(true);
      setTimeout(() => setCopiedRemaining(false), 2000);
    } catch {
      setAlert({ title: "Copy failed", message: "Could not copy to clipboard.", type: "error" });
    }
  };

  const handleAlertClose = () => {
    setAlert(null);
    if (step === 2) onClose(); // Close the whole popup after viewing success
  };

  const pct = progress && progress.total > 0 ? (progress.done / progress.total) * 100 : 0;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/50 p-3 backdrop-blur-sm sm:p-4"
        onClick={() => !loading && onClose()}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="extractor-title"
          onClick={(e) => e.stopPropagation()}
          className="flex max-h-[92dvh] w-full max-w-2xl animate-pop-in flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line bg-surface-2/70 px-4 py-3.5 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-white">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
                </svg>
              </span>
              <div className="min-w-0">
                <h2 id="extractor-title" className="truncate text-base font-bold">
                  AI URL Extractor
                </h2>
                <p className="text-xs text-subtle">
                  Step {step} of 2 · {step === 1 ? "paste your text" : "review & add"}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={loading}
              aria-label="Close"
              className="shrink-0 rounded-lg p-1.5 text-subtle transition-colors hover:bg-surface-3 hover:text-fg disabled:opacity-40"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
            {step === 1 ? (
              <>
                <p className="mb-3 text-sm text-muted">
                  Paste messy text containing URLs from YouTube, Twitter, Instagram, and more.
                  The AI pulls out every valid link automatically.
                </p>

                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  disabled={loading}
                  placeholder="Paste your text here…"
                  aria-label="Text containing URLs"
                  className="h-48 w-full resize-none rounded-xl border border-line bg-surface-2 p-4 font-mono text-sm text-fg placeholder-subtle transition-all focus:border-accent focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/20 sm:h-60"
                />

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-subtle">
                  <span>Max {MAX_LINES} lines · {MAX_CHARS.toLocaleString()} characters</span>
                  <span className={`font-mono tabular-nums ${overLimit ? "font-bold text-danger" : ""}`}>
                    {lineCount}/{MAX_LINES} lines · {inputText.length.toLocaleString()}/
                    {MAX_CHARS.toLocaleString()}
                  </span>
                </div>
              </>
            ) : (
              <>
                <p className="mb-3 text-sm font-semibold">
                  Extracted{" "}
                  <span className="text-accent">{extractedUrls.length}</span> valid URL
                  {extractedUrls.length !== 1 ? "s" : ""}
                </p>

                <ul className="max-h-60 space-y-1 overflow-y-auto rounded-xl border border-line bg-surface-2 p-3 sm:max-h-72">
                  {extractedUrls.map((url, idx) => (
                    <li
                      key={`${url}-${idx}`}
                      className="flex items-start gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-3"
                    >
                      <span className="mt-0.5 w-6 shrink-0 text-right font-mono text-[10px] tabular-nums text-subtle">
                        {idx + 1}
                      </span>
                      <span className="min-w-0 break-all font-mono text-xs text-muted">{url}</span>
                    </li>
                  ))}
                </ul>

                {remainingUrls.length > 0 && (
                  <div className="mt-3 flex flex-col items-start justify-between gap-2 rounded-xl border border-warn-line bg-warn-soft p-3 sm:flex-row sm:items-center">
                    <span className="text-sm font-medium text-warn">
                      {remainingUrls.length} URL{remainingUrls.length !== 1 ? "s" : ""} not included
                      in this batch.
                    </span>
                    <button
                      onClick={copyRemaining}
                      className="shrink-0 rounded-lg bg-warn px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:brightness-110"
                    >
                      {copiedRemaining ? "Copied!" : "Copy remaining"}
                    </button>
                  </div>
                )}
              </>
            )}

            {error && (
              <div
                role="alert"
                className="mt-4 rounded-xl border border-danger-line bg-danger-soft p-3 text-sm text-danger"
              >
                {error}
              </div>
            )}
          </div>

          {/* Live upload progress — replaces the old text-only status. */}
          {progress && (
            <div className="shrink-0 border-t border-line px-4 pt-3 sm:px-6">
              <div className="mb-1 flex items-center justify-between text-[11px] font-medium">
                <span className="text-accent">{statusText}</span>
                <span className="font-mono tabular-nums text-subtle">
                  {progress.done}/{progress.total}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full origin-left rounded-full bg-gradient-to-r from-accent to-accent-2 transition-transform duration-300"
                  style={{ transform: `scaleX(${pct / 100})` }}
                />
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line bg-surface-2/70 px-4 py-3.5 sm:px-6">
            <p className="min-w-0 truncate text-xs font-medium text-accent">
              {step === 1 ? statusText : ""}
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => (step === 2 && !loading ? setStep(1) : onClose())}
                disabled={loading}
                className="rounded-lg px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-3 hover:text-fg disabled:opacity-50"
              >
                {step === 2 ? "Back" : "Cancel"}
              </button>

              {step === 1 ? (
                <button
                  onClick={handleExtract}
                  disabled={loading || !inputText.trim() || overLimit}
                  className="flex min-w-[124px] items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-accent to-accent-2 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition-all hover:shadow-xl disabled:opacity-50 disabled:shadow-none"
                >
                  {loading ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Extracting…
                    </>
                  ) : (
                    "Extract URLs"
                  )}
                </button>
              ) : (
                <button
                  onClick={handleBulkUpload}
                  disabled={loading}
                  className="flex min-w-[140px] items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-ok to-accent-3 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-ok/25 transition-all hover:shadow-xl disabled:opacity-50 disabled:shadow-none"
                >
                  {loading ? (
                    <>
                      <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Saving…
                    </>
                  ) : (
                    `Add ${extractedUrls.length} URL${extractedUrls.length !== 1 ? "s" : ""}`
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {alert && (
        <AlertMessagePopUp
          title={alert.title}
          message={alert.message}
          type={alert.type}
          onClose={handleAlertClose}
        />
      )}
    </>
  );
}
