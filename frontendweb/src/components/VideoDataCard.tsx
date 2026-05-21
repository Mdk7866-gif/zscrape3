"use client";

import { useState } from "react";
import { useDownloadQueue } from "@/components/DownloadQueueContext";
import ConformationMessagePopUp from "@/components/ConformationMessagePopUp";

interface VideoData {
  id: string;
  title: string;
  platform: string;
  thumbnail?: string;
  duration_seconds: number;
  url: string;
  upload_date?: string;
}

export default function VideoDataCard({ video, onDelete }: { video: VideoData, onDelete: (id: string) => void }) {
  const { jobs, dbStatuses, addToQueue, cancelJob, removeJob } = useDownloadQueue();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRedownloadConfirm, setShowRedownloadConfirm] = useState(false);

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
  // If it's pending in the DB but no active job exists, it means the tab was closed/crashed. Treat as fresh so they can start it again.
  const isFresh = !job && (!dbStatus || dbStatus === "fresh" || dbStatus === "pending");

  const startDownload = () => addToQueue(video.id);
  const cancelDownload = () => cancelJob(video.id);
  const dismissState = () => removeJob(video.id);

  const handleRedownload = () => {
    setShowRedownloadConfirm(false);
    addToQueue(video.id);
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const getPhaseText = () => {
    if (!job) return "";
    if (isQueued) return "Waiting in queue...";
    if (job.phase === "starting") return "Starting...";
    if (job.phase === "video") return "Downloading video...";
    if (job.phase === "audio") return "Downloading audio...";
    if (job.phase === "merging") return "Merging...";
    if (job.phase === "done") return "Done!";
    return "Downloading...";
  };

  const getThumbnailUrl = () => {
    if (!video.thumbnail) return "";
    const lower = video.thumbnail.toLowerCase();
    if (lower.includes("fbcdn.net") || lower.includes("cdninstagram.com") || lower.includes("scontent")) {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
      return `${apiBase}/proxy/image?url=${encodeURIComponent(video.thumbnail)}`;
    }
    return video.thumbnail;
  };

  const getPlatformColors = (platform: string) => {
    const p = platform.toLowerCase();
    if (p === "youtube") return "bg-red-50 text-red-600 border-red-200";
    if (p === "twitter" || p === "x") return "bg-zinc-900 text-white border-zinc-700";
    if (p === "instagram") return "bg-fuchsia-50 text-fuchsia-600 border-fuchsia-200";
    if (p === "reddit") return "bg-orange-50 text-orange-600 border-orange-200";
    if (p === "facebook") return "bg-blue-50 text-blue-600 border-blue-200";
    if (p === "tiktok") return "bg-black text-white border-black";
    return "bg-zinc-100 text-zinc-600 border-zinc-200";
  };

  return (
    <>
      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow group flex flex-col mx-auto w-full max-w-[260px] relative" style={{ minHeight: "300px" }}>
        {/* Clickable overlay to open source URL */}
        <a
          href={video.url}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute inset-0 z-0"
          title="Open original video"
        />

        {/* Thumbnail */}
        <div className="relative h-[148px] w-full bg-zinc-100 flex items-center justify-center shrink-0 pointer-events-none z-10">
          {video.thumbnail ? (
            <img src={getThumbnailUrl()} alt={video.title} className="w-full h-full object-cover" />
          ) : (
            <span className="text-zinc-400 text-sm">No Thumbnail</span>
          )}
          <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded font-medium">
            {formatDuration(video.duration_seconds)}
          </div>
        </div>

        {/* Card body */}
        <div className="p-3.5 flex flex-col flex-1 z-10 pointer-events-none">
          {/* Title — always 2 lines, uniform height */}
          <h3
            className="font-semibold text-zinc-900 text-sm mb-2"
            title={video.title}
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              minHeight: "2.5rem",   // exactly 2 lines
            }}
          >
            {video.title}
          </h3>

          {/* Platform badge + date */}
          <div className="flex items-center justify-between mb-3">
            <span className={`uppercase tracking-wider font-semibold text-[9px] border px-2 py-0.5 rounded-full ${getPlatformColors(video.platform)}`}>
              {video.platform}
            </span>
            {video.upload_date && (
              <span className="text-[10px] text-zinc-400 bg-zinc-50 px-1.5 py-0.5 rounded border border-zinc-100">
                {video.upload_date}
              </span>
            )}
          </div>

          {/* Bottom action area — always at bottom */}
          <div className="mt-auto pointer-events-auto">

            {/* ── Session: Completed ── */}
            {isCompleted && (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12"/></svg>
                <span className="text-xs text-green-700 font-medium flex-1">Downloaded!</span>
                <button onClick={() => setShowRedownloadConfirm(true)} className="text-[10px] text-blue-600 hover:underline mr-1">Re-download</button>
                <button onClick={dismissState} className="text-zinc-400 hover:text-zinc-600 text-xs">✕</button>
              </div>
            )}

            {/* ── Session: Failed ── */}
            {isError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-red-700 font-medium">Download Failed</p>
                  <p className="text-[10px] text-red-500 truncate" title={job.error}>{job.error || "Unknown error"}</p>
                </div>
                <button onClick={() => setShowRedownloadConfirm(true)} className="text-[10px] text-blue-600 hover:underline shrink-0 mr-1">Retry</button>
                <button onClick={dismissState} className="text-zinc-400 hover:text-zinc-600 text-xs shrink-0">✕</button>
              </div>
            )}

            {/* ── Session: Cancelled ── */}
            {isCancelled && (
              <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2">
                <span className="text-xs text-zinc-500 flex-1">Cancelled</span>
                <button onClick={() => setShowRedownloadConfirm(true)} className="text-xs text-blue-600 hover:underline font-medium">Retry</button>
              </div>
            )}

            {/* ── Persistent: Downloaded (from previous session) ── */}
            {persistedCompleted && (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12"/></svg>
                <span className="text-xs text-green-700 font-medium flex-1">Already Downloaded</span>
                <button onClick={() => setShowRedownloadConfirm(true)} className="text-[10px] text-blue-600 hover:underline">Re-download</button>
              </div>
            )}

            {/* ── Persistent: Failed (from previous session) ── */}
            {persistedFailed && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                <span className="text-xs text-red-700 font-medium flex-1">Previously Failed</span>
                <button onClick={() => setShowRedownloadConfirm(true)} className="text-[10px] text-blue-600 hover:underline">Retry</button>
              </div>
            )}

            {/* ── Persistent: Cancelled (from previous session) ── */}
            {persistedCancelled && (
              <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2">
                <span className="text-xs text-zinc-500 flex-1">Previously Cancelled</span>
                <button onClick={() => setShowRedownloadConfirm(true)} className="text-[10px] text-blue-600 hover:underline font-medium">Download</button>
              </div>
            )}

            {/* ── Downloading / Queued ── */}
            {isDownloading && (
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-blue-600 font-medium truncate pr-2">{getPhaseText()}</span>
                  <span className="text-zinc-500 shrink-0">{job.progress.toFixed(0)}%</span>
                </div>
                <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 transition-all duration-150 ease-out" style={{ width: `${job.progress}%` }} />
                </div>
                <div className="flex justify-end">
                  <button onClick={cancelDownload} className="text-[10px] text-red-500 hover:text-red-700 font-medium px-2 py-0.5 hover:bg-red-50 rounded transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* ── Fresh: never touched ── */}
            {isFresh && (
              <div className="flex gap-2">
                <button
                  onClick={startDownload}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Download
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
                  title="Delete Video"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete confirmation */}
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

      {/* Re-download confirmation */}
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

