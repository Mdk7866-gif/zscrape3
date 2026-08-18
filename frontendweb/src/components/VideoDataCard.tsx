"use client";

import { useState } from "react";
import { useDownloadQueue } from "@/components/DownloadQueueContext";
import ConformationMessagePopUp from "@/components/ConformationMessagePopUp";
import PlatformBadge from "@/components/PlatformBadge";
import { apiUrl } from "@/lib/api";
import { getPlatform } from "@/lib/platforms";

interface VideoData {
  id: string;
  title: string;
  platform: string;
  thumbnail?: string;
  duration_seconds: number;
  url: string;
  upload_date?: string;
  file_size_bytes?: number;
}

function formatBytes(bytes?: number): string {
  if (!bytes) return "Unknown size";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatUploadDate(dateStr?: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

/**
 * m:ss, or h:mm:ss once the video runs past an hour. A real video's duration
 * is never actually 0 — that value means the extractor couldn't determine it
 * (a known gap for some Instagram posts) — so it's treated as unknown rather
 * than displayed as a literal "0:00", which reads as a wrong duration rather
 * than a missing one.
 */
function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "--:--";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ss = s.toString().padStart(2, "0");
  return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export default function VideoDataCard({
  video,
  onDelete,
}: {
  video: VideoData;
  onDelete: (id: string) => void;
}) {
  const { jobs, dbStatuses, addToQueue, cancelJob, removeJob } = useDownloadQueue();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRedownloadConfirm, setShowRedownloadConfirm] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);

  const job = jobs[video.id];
  const dbStatus = dbStatuses[video.id]; // persisted status from DB

  const isQueued = job?.status === "queued";
  const isDownloading = job && ["queued", "downloading"].includes(job.status);
  const isCompleted = job?.status === "completed";
  const isError = job?.status === "failed";
  const isCancelled = job?.status === "cancelled";

  // Use DB status when no active job in this session
  const persistedCompleted = !job && dbStatus === "downloaded";
  const persistedFailed = !job && dbStatus === "failed";
  const persistedCancelled = !job && dbStatus === "cancelled";
  // If it's pending in the DB but no active job exists, the tab was closed or
  // crashed mid-download. Treat as fresh so it can be started again.
  const isFresh = !job && (!dbStatus || dbStatus === "fresh" || dbStatus === "pending");

  const startDownload = () => addToQueue(video.id);
  const dismissState = () => removeJob(video.id);

  const handleRedownload = () => {
    setShowRedownloadConfirm(false);
    addToQueue(video.id);
  };

  const getPhaseText = () => {
    if (!job) return "";
    if (isQueued) return "Waiting in queue…";
    if (job.phase === "starting") return "Starting…";
    if (job.phase === "video") return "Downloading video…";
    if (job.phase === "audio") return "Downloading audio…";
    if (job.phase === "merging") return "Merging…";
    if (job.phase === "done") return "Done!";
    return "Downloading…";
  };

  const getThumbnailUrl = () => {
    if (!video.thumbnail) return "";
    const lower = video.thumbnail.toLowerCase();
    if (lower.includes("fbcdn.net") || lower.includes("cdninstagram.com") || lower.includes("scontent")) {
      // Plain <img src>, not a fetch — the thumbnail proxy needs no auth.
      return apiUrl(`/proxy/image?url=${encodeURIComponent(video.thumbnail)}`);
    }
    return video.thumbnail;
  };

  const showThumb = Boolean(video.thumbnail) && !thumbFailed;
  const platformInfo = getPlatform(video.platform);

  return (
    <>
      <article className="group card-glow flex h-full w-full flex-col overflow-hidden rounded-2xl border border-line bg-surface/90 shadow-sm backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/10">
        {/* ---------- Thumbnail ---------- */}
        <a
          href={video.url}
          target="_blank"
          rel="noopener noreferrer"
          title="Open original video"
          /* aspect-video reserves the exact box before the image loads, so a
             slow thumbnail can't push the card body down. */
          className="relative block aspect-video w-full shrink-0 overflow-hidden bg-surface-2"
        >
          {showThumb ? (
            <img
              src={getThumbnailUrl()}
              alt=""
              width={320}
              height={180}
              loading="lazy"
              decoding="async"
              onError={() => setThumbFailed(true)}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-2 to-surface-3 text-xs font-medium text-subtle">
              No thumbnail
            </span>
          )}

          {/* Scrims so the chips stay readable over bright/busy frames — a
              translucent theme-colored badge (the old approach) has no
              guaranteed contrast against an arbitrary thumbnail; a solid dark
              scrim behind fixed white text does. */}
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-black/60 to-transparent"
          />
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/65 to-transparent"
          />

          <span className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-black/55 py-0.5 pl-0.5 pr-2 backdrop-blur-sm">
            {platformInfo && <PlatformBadge platform={platformInfo} size="xs" />}
            <span className="text-[9px] font-bold uppercase tracking-wider text-white">
              {platformInfo?.name ?? video.platform}
            </span>
          </span>

          <span className="absolute bottom-2 right-2 rounded-md bg-black/75 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white tabular-nums">
            {formatDuration(video.duration_seconds)}
          </span>
        </a>

        {/* ---------- Body ---------- */}
        <div className="flex min-w-0 flex-1 flex-col p-3.5">
          {/* Fixed 2-line box — long and short titles occupy the same height, so
              every card in a row lines up and nothing reflows on load. */}
          <h3 className="clamp-2 min-h-[2.5rem] text-sm font-semibold leading-tight">
            <a
              href={video.url}
              target="_blank"
              rel="noopener noreferrer"
              title={video.title}
              className="transition-colors hover:text-accent"
            >
              {video.title}
            </a>
          </h3>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted">
              {formatBytes(job?.actualSize || video.file_size_bytes)}
            </span>
            {video.upload_date && (
              <span className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-subtle">
                {formatUploadDate(video.upload_date)}
              </span>
            )}
          </div>

          {/* ---------- Action area ----------
              Height-locked and bottom-aligned. The states below have different
              natural heights (a progress block is taller than a button row);
              without the lock the card would resize every time a download
              started or finished, shifting every card after it in the grid. */}
          <div className="mt-3 flex min-h-[42px] items-end">
            {/* Session: completed */}
            {isCompleted && (
              <StatusRow tone="ok" label="Downloaded!">
                <TextButton onClick={() => setShowRedownloadConfirm(true)}>Again</TextButton>
                <IconButton onClick={dismissState} label="Dismiss">
                  <CloseIcon />
                </IconButton>
                <IconButton onClick={() => setShowDeleteConfirm(true)} label="Delete video" danger>
                  <TrashIcon />
                </IconButton>
              </StatusRow>
            )}

            {/* Session: failed */}
            {isError && (
              <StatusRow tone="danger" label="Failed" hint={job.error || "Unknown error"}>
                <TextButton onClick={() => setShowRedownloadConfirm(true)}>Retry</TextButton>
                <IconButton onClick={dismissState} label="Dismiss">
                  <CloseIcon />
                </IconButton>
                <IconButton onClick={() => setShowDeleteConfirm(true)} label="Delete video" danger>
                  <TrashIcon />
                </IconButton>
              </StatusRow>
            )}

            {/* Session: cancelled */}
            {isCancelled && (
              <StatusRow tone="neutral" label="Cancelled">
                <TextButton onClick={() => setShowRedownloadConfirm(true)}>Retry</TextButton>
                <IconButton onClick={() => setShowDeleteConfirm(true)} label="Delete video" danger>
                  <TrashIcon />
                </IconButton>
              </StatusRow>
            )}

            {/* Persisted from an earlier session */}
            {persistedCompleted && (
              <StatusRow tone="ok" label="Already downloaded">
                <TextButton onClick={() => setShowRedownloadConfirm(true)}>Again</TextButton>
                <IconButton onClick={() => setShowDeleteConfirm(true)} label="Delete video" danger>
                  <TrashIcon />
                </IconButton>
              </StatusRow>
            )}
            {persistedFailed && (
              <StatusRow tone="danger" label="Previously failed">
                <TextButton onClick={() => setShowRedownloadConfirm(true)}>Retry</TextButton>
                <IconButton onClick={() => setShowDeleteConfirm(true)} label="Delete video" danger>
                  <TrashIcon />
                </IconButton>
              </StatusRow>
            )}
            {persistedCancelled && (
              <StatusRow tone="neutral" label="Previously cancelled">
                <TextButton onClick={() => setShowRedownloadConfirm(true)}>Download</TextButton>
                <IconButton onClick={() => setShowDeleteConfirm(true)} label="Delete video" danger>
                  <TrashIcon />
                </IconButton>
              </StatusRow>
            )}

            {/* Downloading / queued */}
            {isDownloading && (
              <div className="w-full space-y-1.5">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="truncate pr-2 font-medium text-accent">{getPhaseText()}</span>
                  <span className="shrink-0 font-mono tabular-nums text-muted">
                    {job.progress.toFixed(0)}%
                  </span>
                </div>
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-surface-3"
                  role="progressbar"
                  aria-valuenow={Math.round(job.progress)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Download progress for ${video.title}`}
                >
                  {/* scaleX, not width — animating width re-lays-out the row on
                      every progress tick. */}
                  <div
                    className="h-full origin-left rounded-full bg-gradient-to-r from-accent to-accent-2 transition-transform duration-200 ease-out"
                    style={{ transform: `scaleX(${Math.max(0, Math.min(100, job.progress)) / 100})` }}
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => cancelJob(video.id)}
                    className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-danger transition-colors hover:bg-danger-soft"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Fresh: never touched */}
            {isFresh && (
              <div className="flex w-full gap-2">
                <button
                  onClick={startDownload}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-accent to-accent-2 py-2 text-xs font-semibold text-white shadow-md shadow-accent/25 transition-all hover:shadow-lg hover:shadow-accent/35"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Download
                </button>
                <IconButton onClick={() => setShowDeleteConfirm(true)} label="Delete video" danger>
                  <TrashIcon />
                </IconButton>
              </div>
            )}
          </div>
        </div>
      </article>

      {showDeleteConfirm && (
        <ConformationMessagePopUp
          title="Delete Video?"
          message="Are you sure you want to delete this video? This cannot be undone."
          confirmLabel="Delete"
          danger
          onConfirm={() => {
            onDelete(video.id);
            setShowDeleteConfirm(false);
          }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {showRedownloadConfirm && (
        <ConformationMessagePopUp
          title="Download Again?"
          message="This video has already been downloaded or previously attempted. Do you want to download it again?"
          confirmLabel="Download Again"
          onConfirm={handleRedownload}
          onCancel={() => setShowRedownloadConfirm(false)}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Small shared pieces — the six status states differ only in tone and
 * which buttons they carry, so they share one row shell.
 * ------------------------------------------------------------------ */

const TONES = {
  ok: "border-ok-line bg-ok-soft text-ok",
  danger: "border-danger-line bg-danger-soft text-danger",
  neutral: "border-line bg-surface-2 text-muted",
} as const;

function StatusRow({
  tone,
  label,
  hint,
  children,
}: {
  tone: keyof typeof TONES;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex w-full items-center gap-1.5 rounded-lg border px-2.5 py-1.5 ${TONES[tone]}`}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-semibold">{label}</p>
        {hint && <p className="truncate text-[9.5px] opacity-75" title={hint}>{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function TextButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 rounded px-1 text-[10px] font-semibold underline-offset-2 hover:underline"
    >
      {children}
    </button>
  );
}

function IconButton({
  onClick,
  label,
  danger,
  children,
}: {
  onClick: () => void;
  label: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`shrink-0 rounded-lg p-1.5 text-subtle transition-colors ${
        danger ? "hover:bg-danger-soft hover:text-danger" : "hover:bg-surface-3 hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
  </svg>
);

const CloseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
