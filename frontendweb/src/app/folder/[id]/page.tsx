"use client";

import { useState, useEffect, use } from "react";
import VideoDataCard from "@/components/VideoDataCard";
import ChatgptUrlCheckerPopUpCard from "@/components/ChatgptUrlCheckerPopUpCard";
import FailedUrlShowPopUpCard from "@/components/FailedUrlShowPopUpCard";
import ConformationMessagePopUp from "@/components/ConformationMessagePopUp";
import { useDownloadQueue } from "@/components/DownloadQueueContext";

const PAGE_SIZE = 50;

function formatDateHeader(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
}

/** Group an array of videos by their created_at date (YYYY-MM-DD) */
function groupByDate(videos: any[]): { date: string; label: string; items: any[] }[] {
  const map = new Map<string, any[]>();
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

export default function FolderPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const folderId = resolvedParams.id;

  const [videos, setVideos] = useState<any[]>([]);
  const [folderName, setFolderName] = useState<string>("");
  const [folderCreatedAt, setFolderCreatedAt] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [showFailedPopup, setShowFailedPopup] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showDownloadAllConfirm, setShowDownloadAllConfirm] = useState(false);
  const [page, setPage] = useState(1);

  const { addToQueue, jobs, hasActiveDownloads, loadFolderStatuses, downloadDir, pickDownloadDir } = useDownloadQueue();
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  const fetchVideos = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE}/video/fetchall?folder_id=${folderId}`);
      if (!res.ok) throw new Error("Failed to fetch videos");
      const data = await res.json();
      setVideos(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchFolderInfo = async () => {
    try {
      const res = await fetch(`${API_BASE}/folder/fetchall`);
      if (!res.ok) return;
      const data = await res.json();
      const folder = data.find((f: any) => f.id === folderId);
      if (folder) {
        setFolderName(folder.name);
        setFolderCreatedAt(folder.created_at || "");
      }
    } catch {}
  };

  useEffect(() => {
    setPage(1);
    fetchVideos();
    fetchFolderInfo();
    loadFolderStatuses(folderId);
  }, [folderId]);

  const handleDelete = async (videoId: string) => {
    try {
      const res = await fetch(`${API_BASE}/video/delete/${videoId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete video");
      setShowDeleteConfirm(null);
      fetchVideos();
    } catch {
      console.error("Failed to delete video");
    }
  };

  // Pagination
  const totalPages = Math.ceil(videos.length / PAGE_SIZE);
  const paginatedVideos = videos.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Videos on the current page that need to be downloaded
  const videosToDownload = paginatedVideos.filter((v) => {
    const job = jobs[v.id];
    return !job || (job.status !== "queued" && job.status !== "downloading" && job.status !== "completed");
  });

  const handleDownloadAllConfirmed = () => {
    setShowDownloadAllConfirm(false);
    videosToDownload.forEach((v) => addToQueue(v.id));
  };

  // Compute active download count for this page
  const activeOnPage = paginatedVideos.filter(
    (v) => jobs[v.id]?.status === "queued" || jobs[v.id]?.status === "downloading"
  ).length;
  const completedOnPage = paginatedVideos.filter(
    (v) => jobs[v.id]?.status === "completed"
  ).length;

  // Group the paginated videos by date
  const groups = groupByDate(paginatedVideos);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 px-4 sm:px-6 lg:px-8 py-4 sticky top-0 z-10 shrink-0 shadow-sm">
        <div className="max-w-[1400px] mx-auto w-full flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 truncate flex items-center gap-2">
              <span className="text-xl">📁</span> {folderName || "Loading..."}
            </h1>
            <p className="text-sm text-zinc-500 mt-0.5 flex items-center gap-2 flex-wrap">
              {folderCreatedAt && (
                <span className="text-zinc-400 text-xs">
                  Created {new Date(folderCreatedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                </span>
              )}
              <span className="text-zinc-300">·</span>
              <span>{videos.length} {videos.length === 1 ? "Video" : "Videos"}</span>
              {totalPages > 1 && <><span className="text-zinc-300">·</span><span>Page {page}/{totalPages}</span></>}
              {activeOnPage > 0 && (
                <span className="flex items-center gap-1 text-blue-600 text-xs font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse inline-block" />
                  {activeOnPage} downloading…
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Save-to-folder picker */}
            <button
              onClick={pickDownloadDir}
              title={downloadDir ? `Downloads going to: ${downloadDir}` : "Click to choose where to save downloaded videos"}
              className={`flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border transition-all max-w-[170px] ${
                downloadDir
                  ? "bg-green-50 border-green-300 text-green-700"
                  : "bg-white border-zinc-200 text-zinc-500 hover:border-blue-300 hover:text-blue-600"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <span className="truncate">{downloadDir ? downloadDir : "Save Folder"}</span>
            </button>

            <button
              onClick={() => setShowFailedPopup(true)}
              className="bg-white border border-red-200 hover:bg-red-50 text-red-600 font-medium py-2 px-3.5 rounded-lg text-sm transition-all flex items-center gap-2"
            >
              <span className="text-base leading-none">⚠️</span> Failed URLs
            </button>

            {/* Download All */}
            {paginatedVideos.length > 0 && (
              <button
                onClick={() => {
                  if (videosToDownload.length === 0) return;
                  setShowDownloadAllConfirm(true);
                }}
                disabled={hasActiveDownloads || videosToDownload.length === 0}
                className={`flex items-center gap-2 font-medium py-2 px-3.5 rounded-lg text-sm transition-all border ${
                  hasActiveDownloads
                    ? "bg-blue-50 border-blue-200 text-blue-600 cursor-not-allowed"
                    : videosToDownload.length === 0
                    ? "bg-zinc-50 border-zinc-200 text-zinc-400 cursor-not-allowed"
                    : "bg-white border-zinc-300 hover:border-blue-400 hover:bg-blue-50 text-zinc-700 hover:text-blue-700"
                }`}
              >
                {hasActiveDownloads ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    Downloading ({activeOnPage} left)
                  </>
                ) : videosToDownload.length === 0 ? (
                  <>✅ All Downloaded</>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Download All ({videosToDownload.length})
                  </>
                )}
              </button>
            )}

            <button
              onClick={() => setShowPopup(true)}
              disabled={hasActiveDownloads}
              className={`font-medium py-2 px-3.5 rounded-lg text-sm transition-all flex items-center gap-2 ${
                hasActiveDownloads
                  ? "bg-blue-300 text-white cursor-not-allowed opacity-70"
                  : "bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" /><path d="M12 5v14" />
              </svg>
              Add Videos
            </button>
          </div>
        </div>
      </header>

      {/* Save folder hint bar */}
      {!downloadDir && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-8 py-2 text-xs text-amber-700 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          No save folder selected — downloaded videos will go to your browser's default Downloads folder.
          <button onClick={pickDownloadDir} className="ml-1 underline font-semibold hover:text-amber-900">Choose folder</button>
        </div>
      )}
      {downloadDir && (
        <div className="bg-green-50 border-b border-green-200 px-4 sm:px-8 py-2 text-xs text-green-700 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          Downloads will be saved to: <strong className="ml-1">{downloadDir}</strong>
          <button onClick={pickDownloadDir} className="ml-2 underline hover:text-green-900">Change</button>
        </div>
      )}

      {/* Content */}
      <main className="flex-1 overflow-y-auto bg-white">
        <div className="max-w-[1400px] mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
          {loading ? (
            <div className="flex items-center justify-center min-h-[300px]">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center min-h-[300px]">
              <div className="text-red-500 bg-red-50 px-4 py-3 rounded-lg border border-red-100 text-sm max-w-md text-center">{error}</div>
            </div>
          ) : videos.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[300px] text-zinc-400 px-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-zinc-100 flex items-center justify-center mb-4 text-3xl">🎬</div>
              <p className="text-base font-medium text-zinc-600 mb-1">No videos yet</p>
              <p className="text-sm">Click <strong>Add Videos</strong> to start importing.</p>
            </div>
          ) : (
            <>
              {/* Date-grouped video grid */}
              {groups.map((group) => (
                <div key={group.date} className="mb-10">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                    <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{group.label}</span>
                    <div className="flex-1 h-px bg-zinc-100" />
                    <span className="text-xs text-zinc-400">{group.items.length} video{group.items.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 sm:gap-5 justify-items-center">
                    {group.items.map((video) => (
                      <VideoDataCard
                        key={video.id}
                        video={video}
                        onDelete={(id) => setShowDeleteConfirm(id)}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-6">
                  <button
                    onClick={() => { setPage((p) => Math.max(1, p - 1)); window.scrollTo(0, 0); }}
                    disabled={page === 1}
                    className="px-4 py-2 rounded-lg border border-zinc-200 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >← Prev</button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      onClick={() => { setPage(p); window.scrollTo(0, 0); }}
                      className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                        p === page ? "bg-blue-600 text-white shadow-sm" : "border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                      }`}
                    >{p}</button>
                  ))}
                  <button
                    onClick={() => { setPage((p) => Math.min(totalPages, p + 1)); window.scrollTo(0, 0); }}
                    disabled={page === totalPages}
                    className="px-4 py-2 rounded-lg border border-zinc-200 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >Next →</button>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* Popups */}
      {showPopup && (
        <ChatgptUrlCheckerPopUpCard
          folderId={folderId}
          onClose={() => setShowPopup(false)}
          onSuccess={fetchVideos}
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
          title={`Download ${videosToDownload.length} video${videosToDownload.length !== 1 ? "s" : ""}?`}
          message={`This will queue all ${videosToDownload.length} video(s) on this page for download, one at a time. Videos already downloaded will be skipped.`}
          confirmLabel="Start Downloading"
          onConfirm={handleDownloadAllConfirmed}
          onCancel={() => setShowDownloadAllConfirm(false)}
        />
      )}
    </div>
  );
}
