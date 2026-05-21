"use client";

import { useState, useEffect } from "react";

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
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  const startDownload = async () => {
    try {
      setDownloading(true);
      setError(null);
      const res = await fetch(`${API_BASE}/download/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: video.id }),
      });
      if (!res.ok) throw new Error("Failed to start download");
      const data = await res.json();
      setJobId(data.job_id);
    } catch (err: any) {
      setError(err.message);
      setDownloading(false);
    }
  };

  const cancelDownload = async () => {
    if (!jobId) return;
    try {
      await fetch(`${API_BASE}/download/cancel/${jobId}`, { method: "POST" });
      setDownloading(false);
      setJobId(null);
      setProgress(0);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (jobId && downloading) {
      const capturedJobId = jobId; // capture before state can change
      interval = setInterval(async () => {
        try {
          const res = await fetch(`${API_BASE}/download/progress/${capturedJobId}`);
          if (!res.ok) {
            if (res.status === 404) {
              setDownloading(false);
              setJobId(null);
              clearInterval(interval);
            }
            return;
          }
          const data = await res.json();
          setProgress(data.progress);
          if (data.status === "completed") {
            clearInterval(interval);
            setDownloading(false);
            setJobId(null);
            setProgress(100);
            // Trigger browser file download without navigating away
            const a = document.createElement("a");
            a.href = `${API_BASE}/download/file/${capturedJobId}`;
            a.download = "";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          } else if (data.status === "failed" || data.status === "cancelled") {
            setError(data.error || "Download cancelled or failed");
            setDownloading(false);
            setJobId(null);
            clearInterval(interval);
          }
        } catch (err) {
          console.error(err);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [jobId, downloading]);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow group flex flex-col h-[340px] w-full">
      <div className="relative h-[160px] w-full bg-zinc-100 flex items-center justify-center shrink-0">
        {video.thumbnail ? (
          <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" />
        ) : (
          <span className="text-zinc-400">No Thumbnail</span>
        )}
        <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded font-medium">
          {formatDuration(video.duration_seconds)}
        </div>
      </div>
      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-semibold text-zinc-900 text-sm line-clamp-2 mb-2 flex-1" title={video.title}>
          {video.title}
        </h3>
        <div className="flex items-center justify-between text-xs text-zinc-500 mb-4">
          <span className="uppercase tracking-wider font-semibold text-[10px] bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">
            {video.platform}
          </span>
          {video.upload_date && (
            <span>Uploaded: {video.upload_date}</span>
          )}
        </div>
        
        {error && <div className="text-xs text-red-600 mb-2">{error}</div>}
        
        {downloading ? (
          <div className="space-y-2">
            <div className="h-2 bg-zinc-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-zinc-500">{progress.toFixed(1)}%</span>
              <button onClick={cancelDownload} className="text-red-500 hover:text-red-700">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button 
              onClick={startDownload}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-1.5 rounded transition-colors flex items-center justify-center gap-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download
            </button>
            <button 
              onClick={() => onDelete(video.id)}
              className="p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 rounded transition-colors"
              title="Delete Video"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
