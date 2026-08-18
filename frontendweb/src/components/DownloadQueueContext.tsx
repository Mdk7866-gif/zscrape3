"use client";

import React, {
  createContext, useContext, useState, useEffect,
  useCallback, useRef, ReactNode,
} from "react";
import { apiFetch, apiUrl } from "@/lib/api";
import AlertMessagePopUp from "@/components/AlertMessagePopUp";

export type DownloadStatus = "fresh" | "pending" | "downloaded" | "cancelled" | "failed";

export interface DownloadJob {
  videoId: string;
  jobId: string | null;
  status: "queued" | "downloading" | "completed" | "failed" | "cancelled";
  progress: number;
  phase: string;
  error?: string;
  actualSize?: number;
}

interface DownloadQueueContextType {
  jobs: Record<string, DownloadJob>;
  /** Persistent DB statuses keyed by videoId */
  dbStatuses: Record<string, DownloadStatus>;
  hasActiveDownloads: boolean;
  addToQueue: (videoId: string) => void;
  cancelJob: (videoId: string) => void;
  removeJob: (videoId: string) => void;
  cancelAllJobs: () => Promise<void>;
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
  // Replaces a native window.alert(): browser modals block the whole tab and
  // look nothing like the rest of the app's popups.
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);
  const dirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const downloadedJobIds = useRef<Set<string>>(new Set());
  const startingRef = useRef<Set<string>>(new Set());
  const pollingRef = useRef<Set<string>>(new Set());

  const hasActiveDownloads = Object.values(jobs).some(
    (j) => j.status === "queued" || j.status === "downloading"
  );

  // ── Load persistent statuses for a folder ─────────────────────────────────
  const loadFolderStatuses = useCallback(async (folderId: string) => {
    try {
      const res = await apiFetch(`/video-status/folder/${folderId}`);
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
  }, []);

  // ── Sync job completion to DB ──────────────────────────────────────────────
  const syncStatusToDB = useCallback(async (videoId: string, status: DownloadStatus) => {
    try {
      await apiFetch("/video-status/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: videoId, status }),
      });
      setDbStatuses((prev) => ({ ...prev, [videoId]: status }));
    } catch (e) {
      console.error("Failed to sync download status to DB", e);
    }
  }, []);

  // ── Directory picker ───────────────────────────────────────────────────────
  const pickDownloadDir = useCallback(async () => {
    if (!window.showDirectoryPicker) {
      setAlert({
        title: "Folder selection unavailable",
        message:
          "This browser doesn't support choosing a save folder. Downloads will go to your browser's default Downloads folder instead.",
      });
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });
      dirHandleRef.current = handle;
      setDownloadDir(handle.name);
    } catch (e) {
      // AbortError just means the user closed the picker — not worth logging.
      if (!(e instanceof DOMException) || e.name !== "AbortError") {
        console.error("Directory picker error", e);
      }
    }
  }, []);

  // ── Trigger file save ──────────────────────────────────────────────────────
  const triggerSave = useCallback(async (jobId: string, filename: string) => {
    if (downloadedJobIds.current.has(jobId)) return;
    downloadedJobIds.current.add(jobId);
    const fileUrl = apiUrl(`/download/file/${jobId}`);

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
  }, []);

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

          const res = await apiFetch("/download/start", {
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
  }, [jobs, syncStatusToDB]);

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
          const res = await apiFetch(`/download/progress/${job.jobId}`);
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
            if (data.actual_size) {
              updates.actualSize = data.actual_size;
            }

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
  }, [jobs, triggerSave, syncStatusToDB]);

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
      apiFetch(`/download/cancel/${job.jobId}`, { method: "POST" }).catch(() => {});
    }
  }, [jobs, syncStatusToDB]);

  const removeJob = useCallback((videoId: string) => {
    setJobs((prev) => {
      const next = { ...prev };
      delete next[videoId];
      return next;
    });
  }, []);

  const cancelAllJobs = useCallback(async () => {
    const jobValues = Object.values(jobs);
    for (const job of jobValues) {
      if (job.status === "queued" || job.status === "downloading") {
        setJobs((prev) => ({
          ...prev,
          [job.videoId]: { ...prev[job.videoId], status: "cancelled", phase: "cancelled" },
        }));
        syncStatusToDB(job.videoId, "cancelled");
        if (job.jobId) {
          apiFetch(`/download/cancel/${job.jobId}`, { method: "POST" }).catch(() => {});
        }
      }
    }
  }, [jobs, syncStatusToDB]);

  return (
    <DownloadQueueContext.Provider value={{
      jobs, dbStatuses, hasActiveDownloads,
      addToQueue, cancelJob, removeJob, cancelAllJobs,
      loadFolderStatuses,
      downloadDir, pickDownloadDir,
    }}>
      {children}
      {alert && (
        <AlertMessagePopUp
          title={alert.title}
          message={alert.message}
          type="warning"
          onClose={() => setAlert(null)}
        />
      )}
    </DownloadQueueContext.Provider>
  );
}
