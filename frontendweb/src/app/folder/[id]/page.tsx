"use client";

import { useState, useEffect, useMemo, useRef, use } from "react";
import VideoDataCard from "@/components/VideoDataCard";
import ChatgptUrlCheckerPopUpCard from "@/components/ChatgptUrlCheckerPopUpCard";
import FailedUrlShowPopUpCard from "@/components/FailedUrlShowPopUpCard";
import ConformationMessagePopUp from "@/components/ConformationMessagePopUp";
import { FOLDER_ACTIVITY_UPDATED_EVENT, useDownloadQueue } from "@/components/DownloadQueueContext";
import { useAdmin } from "@/components/AdminContext";
import { apiFetch } from "@/lib/api";
import { THUMBNAILS_UPDATED_EVENT } from "@/components/RegenerateThumbnailsButton";

const PAGE_SIZE = 50;

function formatFolderTimestamp(value: string): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return "Unknown time";
  return timestamp.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

interface Video {
  id: string;
  title: string;
  platform: string;
  url: string;
  thumbnail?: string;
  duration_seconds: number;
  upload_date?: string;
  file_size_bytes?: number;
  created_at?: string;
}

function formatDateHeader(dateStr: string) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "Unknown date";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
}

/** Group videos by their created_at date (YYYY-MM-DD). */
function groupByDate(videos: Video[]) {
  const map = new Map<string, Video[]>();
  for (const v of videos) {
    const day = (v.created_at || "").slice(0, 10);
    if (!map.has(day)) map.set(day, []);
    map.get(day)!.push(v);
  }
  return Array.from(map.entries()).map(([date, items]) => ({
    date,
    label: formatDateHeader(date),
    items,
  }));
}

/**
 * Build a windowed page list: 1 … 4 5 [6] 7 8 … 20.
 *
 * The previous version rendered one button per page, which overflowed the
 * header into a horizontal scroll once a folder passed a few hundred videos.
 */
function pageWindow(current: number, total: number): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set<number>([1, total, current, current - 1, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((p) => pages.add(p));
  if (current >= total - 2) [total - 3, total - 2, total - 1].forEach((p) => pages.add(p));

  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) out.push("gap");
    out.push(p);
    prev = p;
  }
  return out;
}

/** Round-robin by platform so the queue spreads requests across sites. */
function roundRobinByPlatform(items: Video[]): Video[] {
  const groups = new Map<string, Video[]>();
  for (const v of items) {
    const p = v.platform || "other";
    if (!groups.has(p)) groups.set(p, []);
    groups.get(p)!.push(v);
  }
  const queues = [...groups.values()];
  const result: Video[] = [];
  let i = 0;
  while (result.length < items.length) {
    const q = queues[i % queues.length];
    if (q && q.length > 0) result.push(q.shift()!);
    i++;
    if (queues.every((q) => q.length === 0)) break;
  }
  return result;
}

export default function FolderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: folderId } = use(params);

  const [videos, setVideos] = useState<Video[]>([]);
  const [folderName, setFolderName] = useState("");
  const [folderCreatedAt, setFolderCreatedAt] = useState("");
  const [folderUpdatedAt, setFolderUpdatedAt] = useState("");
  const [folderLastActivity, setFolderLastActivity] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [showFailedPopup, setShowFailedPopup] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showDownloadAllConfirm, setShowDownloadAllConfirm] = useState(false);
  const [urlsCopied, setUrlsCopied] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  // The page renders its own scroll container, so `window.scrollTo` (what this
  // used to call on page change) scrolled nothing at all — the list stayed
  // where it was after paging.
  const scrollRef = useRef<HTMLElement>(null);

  const {
    addToQueue,
    jobs,
    hasActiveDownloads,
    loadFolderStatuses,
    loadDownloadDirectory,
    downloadDir,
    downloadDirState,
    pickDownloadDir,
    cancelAllJobs,
  } = useDownloadQueue();
  const { isAdmin, checking } = useAdmin();

  const fetchVideos = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch(`/video/fetchall?folder_id=${folderId}`);
      // 404 here means this folder isn't visible in the current workspace —
      // e.g. an admin folder after exiting admin mode, or a stale/guessed URL.
      if (res.status === 404) throw new Error("This folder is not available.");
      if (!res.ok) throw new Error("Failed to fetch videos");
      setVideos(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch videos");
    } finally {
      setLoading(false);
    }
  };

  const fetchFolderInfo = async () => {
    try {
      const res = await apiFetch("/folder/fetchall");
      if (!res.ok) return;
      const data = await res.json();
      const folder = data.find((f: { id: string }) => f.id === folderId);
      if (folder) {
        setFolderName(folder.name);
        setFolderCreatedAt(folder.created_at || "");
        setFolderUpdatedAt(folder.updated_at || "");
        setFolderLastActivity(folder.last_activity || "");
      }
    } catch {
      /* the header just stays on its placeholder */
    }
  };

  // Also re-runs when the workspace changes, so exiting admin mode on an admin
  // folder page immediately surfaces the "not available" state instead of
  // leaving the previous workspace's videos on screen.
  useEffect(() => {
    if (checking) return;
    setPage(1);
    setQuery("");
    fetchVideos();
    fetchFolderInfo();
    loadFolderStatuses(folderId);
    loadDownloadDirectory(folderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId, isAdmin, checking]);

  useEffect(() => {
    const onFolderActivityUpdated = (event: Event) => {
      const activityFolderId = (event as CustomEvent<{ folderId?: string }>).detail?.folderId;
      if (activityFolderId === folderId) fetchFolderInfo();
    };
    window.addEventListener(FOLDER_ACTIVITY_UPDATED_EVENT, onFolderActivityUpdated);
    return () => window.removeEventListener(FOLDER_ACTIVITY_UPDATED_EVENT, onFolderActivityUpdated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId]);

  // The regenerate action lives in the Navbar, outside this tree, so it signals
  // completion by event rather than prop — refetch so the repaired thumbnails
  // appear without a reload.
  useEffect(() => {
    const onThumbnailsUpdated = () => fetchVideos();
    window.addEventListener(THUMBNAILS_UPDATED_EVENT, onThumbnailsUpdated);
    return () => window.removeEventListener(THUMBNAILS_UPDATED_EVENT, onThumbnailsUpdated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId]);

  const handleDelete = async (videoId: string) => {
    try {
      const res = await apiFetch(`/video/delete/${videoId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete video");
      setShowDeleteConfirm(null);
      fetchVideos();
    } catch {
      console.error("Failed to delete video");
    }
  };

  const goToPage = (p: number) => {
    setPage(p);
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return videos;
    return videos.filter(
      (v) =>
        v.title?.toLowerCase().includes(q) ||
        v.url?.toLowerCase().includes(q) ||
        v.platform?.toLowerCase().includes(q)
    );
  }, [videos, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Filtering can shrink the list below the current page — clamp rather than
  // rendering an empty page.
  const safePage = Math.min(page, totalPages);
  const paginatedVideos = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const handleCopyUrls = async () => {
    if (paginatedVideos.length === 0) return;
    const urlText = paginatedVideos.map((v) => v.url).join("\n");
    try {
      await navigator.clipboard.writeText(urlText);
    } catch {
      // Fallback for browsers that block the async clipboard API
      const el = document.createElement("textarea");
      el.value = urlText;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setUrlsCopied(true);
    setTimeout(() => setUrlsCopied(false), 2000);
  };

  // Videos on the current page that still need downloading
  const videosToDownload = paginatedVideos.filter((v) => {
    const job = jobs[v.id];
    return !job || !["queued", "downloading", "completed"].includes(job.status);
  });

  const activeOnPage = paginatedVideos.filter(
    (v) => jobs[v.id]?.status === "queued" || jobs[v.id]?.status === "downloading"
  ).length;

  const handleDownloadAllConfirmed = () => {
    setShowDownloadAllConfirm(false);
    roundRobinByPlatform([...videosToDownload]).forEach((v) => addToQueue(v.id, folderId));
  };

  const groups = groupByDate(paginatedVideos);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ================= Header ================= */}
      <header className="sticky top-0 z-10 shrink-0 border-b border-line bg-surface/80 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-[1600px] px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
            {/* Title block */}
            <div className="min-w-0 flex-1">
              <h1 className="flex min-w-0 items-center gap-2.5 text-lg font-bold tracking-tight sm:text-xl">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-2 text-white">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  </svg>
                </span>
                {/* Placeholder keeps the exact line height while the name loads,
                    so the header never grows or shrinks under the content. */}
                {folderName ? (
                  <span className="truncate">{folderName}</span>
                ) : (
                  <span className="skeleton h-5 w-40 max-w-full rounded" />
                )}
              </h1>

              <p className="mt-1 flex min-h-[1.25rem] flex-wrap items-center gap-x-2 gap-y-1 text-xs text-subtle">
                {folderCreatedAt && (
                  <>
                    <span>
                      Created{" "}
                      {formatFolderTimestamp(folderCreatedAt)}
                    </span>
                    <span aria-hidden>·</span>
                  </>
                )}
                {folderUpdatedAt && (
                  <>
                    <span>
                      Updated{" "}
                      {formatFolderTimestamp(folderUpdatedAt)}
                    </span>
                    <span aria-hidden>·</span>
                  </>
                )}
                {folderLastActivity && (
                  <>
                    <span className="font-medium text-accent">{folderLastActivity}</span>
                    <span aria-hidden>·</span>
                  </>
                )}
                <span className="font-medium text-muted">
                  {videos.length} {videos.length === 1 ? "video" : "videos"}
                </span>
                {query && (
                  <>
                    <span aria-hidden>·</span>
                    <span>{filtered.length} matching</span>
                  </>
                )}
                {totalPages > 1 && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="tabular-nums">
                      Page {safePage}/{totalPages}
                    </span>
                  </>
                )}
                {activeOnPage > 0 && (
                  <span className="flex items-center gap-1.5 font-medium text-accent">
                    <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                    {activeOnPage} downloading…
                  </span>
                )}
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2">
              {videos.length > 8 && (
                <div className="relative order-first w-full sm:order-none sm:w-44 lg:w-52">
                  <svg className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
                  </svg>
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Search videos…"
                    aria-label="Search videos in this folder"
                    className="w-full rounded-lg border border-line bg-surface-2 py-2 pl-9 pr-3 text-sm text-fg placeholder-subtle transition-colors focus:border-accent focus:bg-surface focus:outline-none"
                  />
                </div>
              )}

              <HeaderButton
                onClick={() => setShowFailedPopup(true)}
                tone="danger"
                label="Failed URLs"
                icon={
                  <>
                    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
                    <path d="M12 9v4M12 17h.01" />
                  </>
                }
              />

              <HeaderButton
                onClick={handleCopyUrls}
                disabled={paginatedVideos.length === 0}
                tone={urlsCopied ? "ok" : "neutral"}
                label={urlsCopied ? "Copied!" : "Copy URLs"}
                title={
                  paginatedVideos.length === 0
                    ? "No videos to copy"
                    : `Copy ${paginatedVideos.length} URL(s) on this page`
                }
                icon={
                  urlsCopied ? (
                    <polyline points="20 6 9 17 4 12" />
                  ) : (
                    <>
                      <rect x="9" y="9" width="13" height="13" rx="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </>
                  )
                }
              />

              {paginatedVideos.length > 0 && (
                <HeaderButton
                  onClick={() => {
                    if (hasActiveDownloads) cancelAllJobs();
                    else if (videosToDownload.length > 0) setShowDownloadAllConfirm(true);
                  }}
                  disabled={!hasActiveDownloads && videosToDownload.length === 0}
                  tone={hasActiveDownloads ? "danger" : "neutral"}
                  label={
                    hasActiveDownloads
                      ? `Cancel All (${activeOnPage})`
                      : videosToDownload.length === 0
                      ? "All downloaded"
                      : `Download All (${videosToDownload.length})`
                  }
                  icon={
                    hasActiveDownloads ? (
                      <>
                        <circle cx="12" cy="12" r="9" /><path d="m15 9-6 6M9 9l6 6" />
                      </>
                    ) : videosToDownload.length === 0 ? (
                      <polyline points="20 6 9 17 4 12" />
                    ) : (
                      <>
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                      </>
                    )
                  }
                />
              )}

              <button
                onClick={() => setShowPopup(true)}
                disabled={hasActiveDownloads}
                title={
                  hasActiveDownloads
                    ? "Wait for the current downloads to finish"
                    : "Add videos to this folder"
                }
                className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-accent to-accent-2 px-3.5 py-2 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition-all hover:shadow-xl hover:shadow-accent/35 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12h14" /><path d="M12 5v14" />
                </svg>
                <span className="hidden sm:inline">Add Videos</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ================= Save-location bar =================
          Both variants are the same height, so toggling between them (or
          picking a folder) never shifts the grid below. */}
      <div
        className={`shrink-0 border-b px-4 py-2 text-xs sm:px-6 lg:px-8 ${
          downloadDir
            ? "border-ok-line bg-ok-soft text-ok"
            : downloadDirState === "checking"
            ? "border-line bg-surface-2 text-muted"
            : "border-warn-line bg-warn-soft text-warn"
        }`}
      >
        <div className="mx-auto flex w-full max-w-[1600px] items-center gap-2">
          <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {downloadDir ? (
              <polyline points="20 6 9 17 4 12" />
            ) : (
              <>
                <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
                <path d="M12 9v4M12 17h.01" />
              </>
            )}
          </svg>
          <span className="min-w-0 flex-1 truncate">
            {downloadDir ? (
              <>
                Saving to <strong className="font-semibold">{downloadDir}</strong>
              </>
            ) : downloadDirState === "checking" ? (
              "Checking your saved download folder…"
            ) : downloadDirState === "permission-required" ? (
              "Your saved download folder needs permission. Allow access to use it again."
            ) : downloadDirState === "unsupported" ? (
              "This browser uses its default Downloads folder."
            ) : (
              <>
                <span className="hidden sm:inline">
                  This project uses your browser&apos;s default Downloads folder.
                </span>
                <span className="sm:hidden">Using default Downloads folder.</span>
              </>
            )}
          </span>
          <button
            onClick={() => pickDownloadDir(folderId)}
            disabled={downloadDirState === "checking" || downloadDirState === "unsupported"}
            className="shrink-0 font-semibold underline underline-offset-2 hover:opacity-80 disabled:cursor-not-allowed disabled:no-underline disabled:opacity-70"
          >
            {downloadDirState === "checking"
              ? "Checking…"
              : downloadDirState === "permission-required"
              ? "Allow access"
              : downloadDir
              ? "Change"
              : downloadDirState === "unsupported"
              ? "Browser default"
              : "Choose folder"}
          </button>
        </div>
      </div>

      {/* ================= Content ================= */}
      <main ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
          {loading ? (
            /* Skeletons match the real card grid exactly, so swapping them for
               data doesn't move anything. */
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,220px),1fr))] gap-4 sm:gap-5">
              {Array.from({ length: 10 }, (_, i) => (
                <div
                  key={i}
                  className="overflow-hidden rounded-2xl border border-line bg-surface/60"
                >
                  <div className="skeleton aspect-video w-full rounded-none" />
                  <div className="space-y-2 p-3.5">
                    <div className="skeleton h-3.5 w-[92%]" />
                    <div className="skeleton h-3.5 w-[60%]" />
                    <div className="skeleton h-4 w-24 rounded-md" />
                    <div className="skeleton h-[34px] w-full rounded-lg" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="flex min-h-[320px] items-center justify-center">
              <div className="max-w-md rounded-2xl border border-danger-line bg-danger-soft px-6 py-5 text-center">
                <p className="text-sm font-semibold text-danger">{error}</p>
                <button
                  onClick={fetchVideos}
                  className="mt-3 rounded-lg border border-danger-line bg-surface px-4 py-2 text-xs font-semibold text-danger transition-colors hover:bg-danger-soft"
                >
                  Try again
                </button>
              </div>
            </div>
          ) : videos.length === 0 ? (
            <EmptyState
              icon="🎬"
              title="No videos yet"
              body="Paste your links into the AI extractor to start importing."
              action={
                <button
                  onClick={() => setShowPopup(true)}
                  className="mt-5 rounded-lg bg-gradient-to-r from-accent to-accent-2 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition-all hover:shadow-xl"
                >
                  Add Videos
                </button>
              }
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon="🔍"
              title="No matches"
              body={`Nothing in this folder matches “${query}”.`}
              action={
                <button
                  onClick={() => setQuery("")}
                  className="mt-5 rounded-lg border border-line bg-surface px-5 py-2.5 text-sm font-semibold text-muted transition-colors hover:text-fg"
                >
                  Clear search
                </button>
              }
            />
          ) : (
            <>
              {groups.map((group) => (
                <section key={group.date} className="mb-9 last:mb-0">
                  <div className="mb-4 flex items-center gap-3">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-gradient-to-br from-accent to-accent-2" />
                    <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
                      {group.label}
                    </h2>
                    <div className="h-px flex-1 bg-line" />
                    <span className="shrink-0 text-[11px] tabular-nums text-subtle">
                      {group.items.length} video{group.items.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,220px),1fr))] gap-4 sm:gap-5">
                    {group.items.map((video) => (
                      <VideoDataCard
                        key={video.id}
                        video={video}
                        folderId={folderId}
                        onDelete={(id) => setShowDeleteConfirm(id)}
                      />
                    ))}
                  </div>
                </section>
              ))}

              {/* Pagination */}
              {totalPages > 1 && (
                <nav
                  aria-label="Pagination"
                  className="mt-8 flex flex-wrap items-center justify-center gap-1.5"
                >
                  <button
                    onClick={() => goToPage(Math.max(1, safePage - 1))}
                    disabled={safePage === 1}
                    className="rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    ← Prev
                  </button>
                  {pageWindow(safePage, totalPages).map((p, i) =>
                    p === "gap" ? (
                      <span key={`gap-${i}`} className="px-1 text-sm text-subtle" aria-hidden>
                        …
                      </span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => goToPage(p)}
                        aria-current={p === safePage ? "page" : undefined}
                        className={`h-9 w-9 rounded-lg text-sm font-medium tabular-nums transition-all ${
                          p === safePage
                            ? "bg-gradient-to-br from-accent to-accent-2 text-white shadow-md shadow-accent/25"
                            : "border border-line bg-surface text-muted hover:bg-surface-2 hover:text-fg"
                        }`}
                      >
                        {p}
                      </button>
                    )
                  )}
                  <button
                    onClick={() => goToPage(Math.min(totalPages, safePage + 1))}
                    disabled={safePage === totalPages}
                    className="rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    Next →
                  </button>
                </nav>
              )}
            </>
          )}
        </div>
      </main>

      {/* ================= Popups ================= */}
      {showPopup && (
        <ChatgptUrlCheckerPopUpCard
          folderId={folderId}
          onClose={() => setShowPopup(false)}
          onSuccess={() => { fetchVideos(); fetchFolderInfo(); }}
        />
      )}
      {showFailedPopup && (
        <FailedUrlShowPopUpCard folderId={folderId} onClose={() => setShowFailedPopup(false)} />
      )}
      {showDeleteConfirm && (
        <ConformationMessagePopUp
          title="Delete Video?"
          message="Are you sure you want to delete this video? This cannot be undone."
          confirmLabel="Delete"
          danger
          onConfirm={() => handleDelete(showDeleteConfirm)}
          onCancel={() => setShowDeleteConfirm(null)}
        />
      )}
      {showDownloadAllConfirm && (
        <ConformationMessagePopUp
          title={`Download ${videosToDownload.length} video${
            videosToDownload.length !== 1 ? "s" : ""
          }?`}
          message={`This will queue all ${videosToDownload.length} video(s) on this page for download, one at a time. Videos already downloaded will be skipped.`}
          confirmLabel="Start Downloading"
          onConfirm={handleDownloadAllConfirmed}
          onCancel={() => setShowDownloadAllConfirm(false)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

const HEADER_TONES = {
  neutral: "border-line bg-surface text-muted hover:bg-surface-2 hover:text-fg",
  danger: "border-danger-line bg-surface text-danger hover:bg-danger-soft",
  ok: "border-ok-line bg-ok-soft text-ok",
} as const;

/** Header action button — icon-only on narrow screens, icon + label from sm up. */
function HeaderButton({
  onClick,
  label,
  icon,
  tone = "neutral",
  disabled,
  title,
}: {
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  tone?: keyof typeof HEADER_TONES;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      aria-label={label}
      className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${HEADER_TONES[tone]}`}
    >
      <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {icon}
      </svg>
      <span className="hidden md:inline">{label}</span>
    </button>
  );
}

function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: string;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl border border-line bg-surface-2 text-3xl">
        {icon}
      </div>
      <p className="text-base font-semibold">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>
      {action}
    </div>
  );
}
