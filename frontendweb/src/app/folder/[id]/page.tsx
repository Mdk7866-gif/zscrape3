"use client";

import { useState, useEffect, use } from "react";
import VideoDataCard from "@/components/VideoDataCard";
import ChatgptUrlCheckerPopUpCard from "@/components/ChatgptUrlCheckerPopUpCard";
import FailedUrlShowPopUpCard from "@/components/FailedUrlShowPopUpCard";
import ConformationMessagePopUp from "@/components/ConformationMessagePopUp";
import { useDownloadQueue } from "@/components/DownloadQueueContext";

const PAGE_SIZE = 50;

export default function FolderPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const folderId = resolvedParams.id;

  const [videos, setVideos] = useState<any[]>([]);
  const [folderName, setFolderName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [showFailedPopup, setShowFailedPopup] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [downloadingAll, setDownloadingAll] = useState(false);

  const { addToQueue, jobs, downloadDir, pickDownloadDir } = useDownloadQueue();
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

  const fetchFolderName = async () => {
    try {
      const res = await fetch(`${API_BASE}/folder/fetchall`);
      if (!res.ok) return;
      const data = await res.json();
      const folder = data.find((f: any) => f.id === folderId);
      if (folder) setFolderName(folder.name);
    } catch {}
  };

  useEffect(() => {
    fetchVideos();
    fetchFolderName();
    setPage(1);
  }, [folderId]);

  const handleDelete = async (videoId: string) => {
    try {
      const res = await fetch(`${API_BASE}/video/delete/${videoId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete video");
      setShowDeleteConfirm(null);
      fetchVideos();
    } catch (err) {
      console.error("Failed to delete video");
    }
  };

  // Pagination
  const totalPages = Math.ceil(videos.length / PAGE_SIZE);
  const paginatedVideos = videos.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // "Download All" — queues each video on the current page one-by-one
  const handleDownloadAll = () => {
    const toQueue = paginatedVideos.filter((v) => {
      const job = jobs[v.id];
      // Skip already downloaded, downloading, or queued
      return !job || (job.status !== "queued" && job.status !== "downloading" && job.status !== "completed");
    });
    toQueue.forEach((v) => addToQueue(v.id));
    setDownloadingAll(true);
    setTimeout(() => setDownloadingAll(false), 2000);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 px-4 sm:px-6 lg:px-8 py-4 sticky top-0 z-10 shrink-0 shadow-sm">
        <div className="max-w-[1400px] mx-auto w-full flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 truncate flex items-center gap-2">
              <span className="text-xl">📁</span> {folderName || "Loading..."}
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              {videos.length} {videos.length === 1 ? "Video" : "Videos"}
              {totalPages > 1 && ` · Page ${page} of ${totalPages}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Save-to-folder picker */}
            <button
              onClick={pickDownloadDir}
              title={downloadDir ? `Saving to: ${downloadDir}` : "Choose download folder"}
              className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border transition-all bg-white
                hover:bg-zinc-50 border-zinc-200 text-zinc-600 hover:text-zinc-900 max-w-[160px] truncate"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
              <span className="truncate">{downloadDir ?? "Save Folder"}</span>
            </button>
            <button
              onClick={() => setShowFailedPopup(true)}
              className="bg-white border border-red-200 hover:bg-red-50 text-red-600 font-medium py-2 px-3.5 rounded-lg text-sm transition-all flex items-center gap-2"
            >
              <span className="text-base leading-none">⚠️</span> Failed URLs
            </button>
            {paginatedVideos.length > 0 && (
              <button
                onClick={handleDownloadAll}
                className={`border font-medium py-2 px-3.5 rounded-lg text-sm transition-all flex items-center gap-2 ${
                  downloadingAll
                    ? "bg-green-50 border-green-300 text-green-700"
                    : "bg-white border-zinc-300 hover:border-blue-400 hover:bg-blue-50 text-zinc-700 hover:text-blue-700"
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                {downloadingAll ? "Queued!" : "Download All"}
              </button>
            )}
            <button
              onClick={() => setShowPopup(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-3.5 rounded-lg text-sm transition-all shadow-lg shadow-blue-600/20 flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
              Add Videos
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto bg-white">
        <div className="max-w-[1400px] mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
          {loading ? (
            <div className="flex items-center justify-center min-h-[300px]">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center min-h-[300px]">
              <div className="text-red-500 bg-red-50 px-4 py-3 rounded-lg border border-red-100 text-sm max-w-md text-center">
                {error}
              </div>
            </div>
          ) : videos.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[300px] text-zinc-400 px-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-zinc-100 flex items-center justify-center mb-4 text-3xl">🎬</div>
              <p className="text-base font-medium text-zinc-600 mb-1">No videos yet</p>
              <p className="text-sm">Click <strong>Add Videos</strong> to start importing.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 sm:gap-5 lg:gap-6 justify-items-center">
                {paginatedVideos.map(video => (
                  <VideoDataCard
                    key={video.id}
                    video={video}
                    onDelete={(id) => setShowDeleteConfirm(id)}
                  />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-10">
                  <button
                    onClick={() => { setPage(p => Math.max(1, p - 1)); window.scrollTo(0, 0); }}
                    disabled={page === 1}
                    className="px-4 py-2 rounded-lg border border-zinc-200 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    ← Prev
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                    <button
                      key={p}
                      onClick={() => { setPage(p); window.scrollTo(0, 0); }}
                      className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                        p === page
                          ? "bg-blue-600 text-white shadow-sm"
                          : "border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    onClick={() => { setPage(p => Math.min(totalPages, p + 1)); window.scrollTo(0, 0); }}
                    disabled={page === totalPages}
                    className="px-4 py-2 rounded-lg border border-zinc-200 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {showPopup && (
        <ChatgptUrlCheckerPopUpCard
          folderId={folderId}
          onClose={() => setShowPopup(false)}
          onSuccess={fetchVideos}
        />
      )}

      {showFailedPopup && (
        <FailedUrlShowPopUpCard
          folderId={folderId}
          onClose={() => setShowFailedPopup(false)}
        />
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
    </div>
  );
}
