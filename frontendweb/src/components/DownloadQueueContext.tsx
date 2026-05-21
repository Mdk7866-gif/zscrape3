"use client";

import React, {
  createContext, useContext, useState, useEffect,
  useCallback, useRef, ReactNode,
} from "react";

export type DownloadStatus = "fresh" | "pending" | "downloaded" | "cancelled" | "failed";

export interface DownloadJob {
  videoId: string;
  jobId: string | null;
  status: "queued" | "downloading" | "completed" | "failed" | "cancelled";
  progress: number;
  phase: string;
  error?: string;
}

interface DownloadQueueContextType {
  jobs: Record<string, DownloadJob>;
  /** Persistent DB statuses keyed by videoId */
  dbStatuses: Record<string, DownloadStatus>;
  hasActiveDownloads: boolean;
  addToQueue: (videoId: string) => void;
  cancelJob: (videoId: string) => void;
  removeJob: (videoId: string) => void;
  /** Load persistent statuses for a folder from the DB */
  loadFolderStatuses: (folderId: string) => Promise<void>;
  downloadDir: string | null;
  pickDownloadDir: () => Promise<void>;
}

const DownloadQueueContext = createContext<DownloadQueueContextType | undefined>(undefined);

export function useDownloadQueue() {
  const ctx = useContext(DownloadQueueContext);
  if (!ctx) throw new Error("useDownloadQueue must be used within DownloadQueueProvider");
  return ctx;
}

declare global {
  interface Window {
    showDirectoryPicker?: (opts?: { mode?: string }) => Promise<FileSystemDirectoryHandle>;
  }
}

export function DownloadQueueProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<Record<string, DownloadJob>>({});
  const [dbStatuses, setDbStatuses] = useState<Record<string, DownloadStatus>>({});
  const [downloadDir, setDownloadDir] = useState<string | null>(null);
  const dirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const downloadedJobIds = useRef<Set<string>>(new Set());
  const startingRef = useRef<Set<string>>(new Set());
  const pollingRef = useRef<Set<string>>(new Set());

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  const hasActiveDownloads = Object.values(jobs).some(
    (j) => j.status === "queued" || j.status === "downloading"
  );

  // ── Load persistent statuses for a folder ─────────────────────────────────
  const loadFolderStatuses = useCallback(async (folderId: string) => {
    try {
      const res = await fetch(`${API_BASE}/video-status/folder/${folderId}`);
      if (!res.ok) return;
      const data: Record<string, { status: DownloadStatus }> = await res.json();
      const flat: Record<string, DownloadStatus> = {};
      for (const [vid, val] of Object.entries(data)) {
        flat[vid] = val.status;
      }
      setDbStatuses(flat);
    } catch (e) {
      console.error("Failed to load folder statuses", e);
    }
  }, [API_BASE]);

  // ── Sync job completion to DB ──────────────────────────────────────────────
  const syncStatusToDB = useCallback(async (videoId: string, status: DownloadStatus) => {
    try {
      await fetch(`${API_BASE}/video-status/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: videoId, status }),
      });
      setDbStatuses((prev) => ({ ...prev, [videoId]: status }));
    } catch (e) {
      console.error("Failed to sync download status to DB", e);
    }
  }, [API_BASE]);

  // ── Directory picker ───────────────────────────────────────────────────────
  const pickDownloadDir = useCallback(async () => {
    if (!window.showDirectoryPicker) {
      alert("Your browser doesn't support folder selection. Files will go to your default Downloads folder.");
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });
      dirHandleRef.current = handle;
      setDownloadDir(handle.name);
    } catch (e: any) {
      if (e.name !== "AbortError") console.error("Directory picker error", e);
    }
  }, []);

  // ── Trigger file save ──────────────────────────────────────────────────────
  const triggerSave = useCallback(async (jobId: string, filename: string) => {
    if (downloadedJobIds.current.has(jobId)) return;
    downloadedJobIds.current.add(jobId);
    const fileUrl = `${API_BASE}/download/file/${jobId}`;

    if (dirHandleRef.current) {
      try {
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error("Fetch failed");
        const blob = await res.blob();
        const fh = await dirHandleRef.current.getFileHandle(filename, { create: true });
        const writable = await (fh as any).createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch (e) {
        console.error("Directory save failed, falling back", e);
        downloadedJobIds.current.delete(jobId);
      }
    }
    const a = document.createElement("a");
    a.href = fileUrl;
    a.download = filename || "video.mp4";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [API_BASE]);

  // ── Queue runner ───────────────────────────────────────────────────────────
  useEffect(() => {
    const pending = Object.keys(jobs).filter(
      (id) => jobs[id].status === "queued" && !jobs[id].jobId
    );
    const activeCount = Object.values(jobs).filter(
      (j) => j.status === "downloading" || (j.status === "queued" && j.jobId)
    ).length;

    if (activeCount === 0 && pending.length > 0) {
      const nextVideoId = pending[0];
      if (startingRef.current.has(nextVideoId)) return;
      startingRef.current.add(nextVideoId);

      (async () => {
        try {
          // Mark as pending in DB
          syncStatusToDB(nextVideoId, "pending");

          const res = await fetch(`${API_BASE}/download/start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ video_id: nextVideoId }),
          });
          if (!res.ok) throw new Error("Failed to start download");
          const data = await res.json();

          setJobs((prev) => ({
            ...prev,
            [nextVideoId]: {
              ...prev[nextVideoId],
              jobId: data.job_id,
              status: "downloading",
              phase: "starting",
            },
          }));
        } catch (err: any) {
          setJobs((prev) => ({
            ...prev,
            [nextVideoId]: { ...prev[nextVideoId], status: "failed", error: err.message },
          }));
          syncStatusToDB(nextVideoId, "failed");
        } finally {
          startingRef.current.delete(nextVideoId);
        }
      })();
    }
  }, [jobs, API_BASE, syncStatusToDB]);

  // ── Poller ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const activeJobs = Object.values(jobs).filter(
      (j) => j.jobId && j.status === "downloading"
    );
    if (activeJobs.length === 0) return;

    const interval = setInterval(async () => {
      for (const job of activeJobs) {
        if (!job.jobId || pollingRef.current.has(job.jobId)) continue;
        pollingRef.current.add(job.jobId);
        try {
          const res = await fetch(`${API_BASE}/download/progress/${job.jobId}`);
          if (!res.ok) {
            if (res.status === 404) {
              setJobs((prev) => ({
                ...prev,
                [job.videoId]: { ...prev[job.videoId], status: "cancelled" },
              }));
              syncStatusToDB(job.videoId, "cancelled");
            }
            continue;
          }
          const data = await res.json();

          setJobs((prev) => {
            const current = prev[job.videoId];
            if (!current || current.status !== "downloading") return prev;

            const updates: Partial<DownloadJob> = {
              progress: data.progress ?? current.progress,
              phase: data.phase || current.phase,
            };

            if (data.status === "completed") {
              updates.status = "completed";
              updates.progress = 100;
              updates.phase = "done";
              triggerSave(job.jobId!, data.filename || "video.mp4");
              syncStatusToDB(job.videoId, "downloaded");
            } else if (data.status === "failed") {
              updates.status = "failed";
              updates.error = data.error || "Download failed";
              syncStatusToDB(job.videoId, "failed");
            } else if (data.status === "cancelled") {
              updates.status = "cancelled";
              syncStatusToDB(job.videoId, "cancelled");
            }

            return { ...prev, [job.videoId]: { ...current, ...updates } };
          });
        } catch (e) {
          console.error("Poll error", e);
        } finally {
          pollingRef.current.delete(job.jobId);
        }
      }
    }, 500);

    return () => clearInterval(interval);
  }, [jobs, API_BASE, triggerSave, syncStatusToDB]);

  // ── Public API ─────────────────────────────────────────────────────────────
  const addToQueue = useCallback((videoId: string) => {
    setJobs((prev) => {
      if (prev[videoId] && ["queued", "downloading"].includes(prev[videoId].status)) return prev;
      return {
        ...prev,
        [videoId]: { videoId, jobId: null, status: "queued", progress: 0, phase: "queued" },
      };
    });
  }, []);

  const cancelJob = useCallback(async (videoId: string) => {
    const job = jobs[videoId];
    if (!job) return;
    setJobs((prev) => ({
      ...prev,
      [videoId]: { ...prev[videoId], status: "cancelled", phase: "cancelled" },
    }));
    syncStatusToDB(videoId, "cancelled");
    if (job.jobId) {
      fetch(`${API_BASE}/download/cancel/${job.jobId}`, { method: "POST" }).catch(() => {});
    }
  }, [jobs, API_BASE, syncStatusToDB]);

  const removeJob = useCallback((videoId: string) => {
    setJobs((prev) => {
      const next = { ...prev };
      delete next[videoId];
      return next;
    });
  }, []);

  return (
    <DownloadQueueContext.Provider value={{
      jobs, dbStatuses, hasActiveDownloads,
      addToQueue, cancelJob, removeJob,
      loadFolderStatuses,
      downloadDir, pickDownloadDir,
    }}>
      {children}
    </DownloadQueueContext.Provider>
  );
}
