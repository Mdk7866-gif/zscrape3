"use client";

import { useState, useEffect, use } from "react";
import VideoDataCard from "@/components/VideoDataCard";
import ChatgptUrlCheckerPopUpCard from "@/components/ChatgptUrlCheckerPopUpCard";

export default function FolderPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const folderId = resolvedParams.id;

  const [videos, setVideos] = useState<any[]>([]);
  const [folderName, setFolderName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPopup, setShowPopup] = useState(false);

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
  }, [folderId]);

  const handleDelete = async (videoId: string) => {
    if (!confirm("Are you sure you want to delete this video?")) return;
    try {
      const res = await fetch(`${API_BASE}/video/delete/${videoId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete video");
      fetchVideos();
    } catch (err) {
      alert("Failed to delete video");
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <header className="px-4 sm:px-6 lg:px-8 py-4 sm:py-5 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white sticky top-0 z-10">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-zinc-400 mb-1">
            <span>📁</span>
            <span className="truncate">{folderName || "Loading..."}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight truncate">
            {folderName ? folderName : "Folder"}
          </h1>
          <p className="text-zinc-500 text-xs sm:text-sm mt-0.5 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0"></span>
            {videos.length} {videos.length === 1 ? "Video" : "Videos"}
          </p>
        </div>
        <button
          onClick={() => setShowPopup(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 shrink-0 w-full sm:w-auto"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
          Add Videos
        </button>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 sm:gap-5 lg:gap-6">
            {videos.map(video => (
              <VideoDataCard key={video.id} video={video} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </main>

      {showPopup && (
        <ChatgptUrlCheckerPopUpCard
          folderId={folderId}
          onClose={() => setShowPopup(false)}
          onSuccess={fetchVideos}
        />
      )}
    </div>
  );
}
