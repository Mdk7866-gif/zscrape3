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
  const { jobs, addToQueue, cancelJob, removeJob } = useDownloadQueue();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const job = jobs[video.id];
  const isDownloading = job && ["queued", "downloading"].includes(job.status);
  const isError = job && job.status === "failed";

  const startDownload = () => {
    addToQueue(video.id);
  };

  const cancelDownload = () => {
    cancelJob(video.id);
  };

  const dismissError = () => {
    removeJob(video.id);
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const getPhaseText = () => {
    if (!job) return "";
    if (job.status === "queued") return "Waiting in queue...";
    if (job.phase === "starting") return "Starting...";
    if (job.phase === "video") return "Downloading video...";
    if (job.phase === "audio") return "Downloading audio...";
    if (job.phase === "merging") return "Merging formats...";
    if (job.phase === "done") return "Done!";
    return "Downloading...";
  };

  return (
    <>
      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow group flex flex-col mx-auto w-full max-w-[260px] h-[360px]">
        <div className="relative h-[150px] w-full bg-zinc-100 flex items-center justify-center shrink-0">
          {video.thumbnail ? (
            <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" />
          ) : (
            <span className="text-zinc-400 text-sm">No Thumbnail</span>
          )}
          <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded font-medium">
            {formatDuration(video.duration_seconds)}
          </div>
        </div>
        <div className="p-3.5 flex flex-col flex-1">
          <h3 className="font-semibold text-zinc-900 text-sm line-clamp-2 mb-2 flex-1" title={video.title}>
            {video.title}
          </h3>
          <div className="flex items-center justify-between text-[11px] text-zinc-500 mb-3">
            <span className="uppercase tracking-wider font-semibold text-[9px] bg-zinc-100 border border-zinc-200 text-zinc-600 px-2 py-0.5 rounded-full">
              {video.platform}
            </span>
          </div>
          
          {isError && (
            <div className="text-[10px] text-red-600 mb-2 flex justify-between items-center bg-red-50 p-1.5 rounded">
              <span className="truncate mr-2" title={job.error}>{job.error || "Failed"}</span>
              <button onClick={dismissError} className="hover:text-red-800 font-bold">×</button>
            </div>
          )}
          
          {isDownloading ? (
            <div className="space-y-1.5 mt-auto">
              <div className="flex justify-between items-center text-[10px] mb-1">
                <span className="text-blue-600 font-medium truncate pr-2">{getPhaseText()}</span>
                <span className="text-zinc-500 shrink-0">{job.progress.toFixed(0)}%</span>
              </div>
              <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 transition-all duration-500 ease-out"
                  style={{ width: `${job.progress}%` }}
                />
              </div>
              <div className="flex justify-end pt-1">
                <button onClick={cancelDownload} className="text-[10px] text-red-500 hover:text-red-700 font-medium px-2 py-1 hover:bg-red-50 rounded transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2 mt-auto">
              <button 
                onClick={startDownload}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-sm"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Download
              </button>
              <button 
                onClick={() => setShowDeleteConfirm(true)}
                className="p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
                title="Delete Video"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              </button>
            </div>
          )}
        </div>
      </div>

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
    </>
  );
}
