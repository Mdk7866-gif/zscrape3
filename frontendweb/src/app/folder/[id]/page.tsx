"use client";

import { useState, useEffect, use } from "react";
import VideoDataCard from "@/components/VideoDataCard";
import ChatgptUrlCheckerPopUpCard from "@/components/ChatgptUrlCheckerPopUpCard";

export default function FolderPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const folderId = resolvedParams.id;
  
  const [videos, setVideos] = useState<any[]>([]);
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

  useEffect(() => {
    fetchVideos();
  }, [folderId]);

  const handleDelete = async (videoId: string) => {
    if (!confirm("Are you sure you want to delete this video?")) return;
    try {
      const res = await fetch(`${API_BASE}/video/delete/${videoId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete video");
      fetchVideos();
    } catch (err) {
      console.error(err);
      alert("Failed to delete video");
    }
  };

  return (
    <div className="flex-1 bg-white flex flex-col h-full overflow-hidden">
      <header className="px-8 py-6 border-b border-zinc-100 flex items-center justify-between bg-white sticky top-0 z-10">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Folder Videos</h1>
          <p className="text-zinc-500 text-sm mt-1 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            {videos.length} {videos.length === 1 ? 'Video' : 'Videos'}
          </p>
        </div>
        <button 
          onClick={() => setShowPopup(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm transition-all shadow-lg shadow-blue-600/20 flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
          Add Videos
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-8">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-red-500 bg-red-50 px-4 py-3 rounded-lg border border-red-100">
              {error}
            </div>
          </div>
        ) : videos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-400">
            <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-4 opacity-50"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>
            <p className="text-lg font-medium text-zinc-600 mb-2">No videos yet</p>
            <p className="text-sm">Click "Add Videos" to start importing.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
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
