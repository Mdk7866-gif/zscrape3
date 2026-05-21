"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";

interface DownloadJob {
  videoId: string;
  jobId: string | null;
  status: "queued" | "downloading" | "completed" | "failed" | "cancelled";
  progress: number;
  phase: string;
  error?: string;
}

interface DownloadQueueContextType {
  jobs: Record<string, DownloadJob>;
  addToQueue: (videoId: string) => void;
  cancelJob: (videoId: string) => void;
  removeJob: (videoId: string) => void;
  downloadDir: string | null;
  pickDownloadDir: () => Promise<void>;
}

const DownloadQueueContext = createContext<DownloadQueueContextType | undefined>(undefined);

export function useDownloadQueue() {
  const context = useContext(DownloadQueueContext);
  if (!context) throw new Error("useDownloadQueue must be used within a DownloadQueueProvider");
  return context;
}

// Extend Window for File System Access API types
declare global {
  interface Window {
    showDirectoryPicker?: (opts?: { mode?: string }) => Promise<FileSystemDirectoryHandle>;
  }
}

export function DownloadQueueProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<Record<string, DownloadJob>>({});
  const [downloadDir, setDownloadDir] = useState<string | null>(null);
  const dirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);

  // Track which jobIds have already triggered the file download to prevent duplicates
  const downloadedJobIds = useRef<Set<string>>(new Set());

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  // ── Directory picker ──────────────────────────────────────────────────────
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

  // ── Trigger file download (browser save) ─────────────────────────────────
  const triggerSave = useCallback(async (jobId: string, filename: string) => {
    if (downloadedJobIds.current.has(jobId)) return;
    downloadedJobIds.current.add(jobId);

    const fileUrl = `${API_BASE}/download/file/${jobId}`;

    // If we have a directory handle, stream directly into that folder
    if (dirHandleRef.current) {
      try {
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error("Fetch failed");
        const blob = await res.blob();
        const fileHandle = await dirHandleRef.current.getFileHandle(filename, { create: true });
        const writable = await (fileHandle as any).createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch (e) {
        // Fall through to regular anchor download if directory write fails
        console.error("Directory save failed, falling back to browser download", e);
        downloadedJobIds.current.delete(jobId); // allow retry via fallback
      }
    }

    // Regular browser download
    const a = document.createElement("a");
    a.href = fileUrl;
    a.download = filename || "video.mp4";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [API_BASE]);

  // ── Queue runner: starts next pending job when nothing is active ──────────
  const startingRef = useRef<Set<string>>(new Set()); // prevent double-starting

  useEffect(() => {
    const pendingVideoIds = Object.keys(jobs).filter(
      (id) => jobs[id].status === "queued" && !jobs[id].jobId
    );
    const activeCount = Object.values(jobs).filter(
      (j) => j.status === "downloading" || (j.status === "queued" && j.jobId)
    ).length;

    if (activeCount === 0 && pendingVideoIds.length > 0) {
      const nextVideoId = pendingVideoIds[0];
      if (startingRef.current.has(nextVideoId)) return;
      startingRef.current.add(nextVideoId);

      const startDownload = async () => {
        try {
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
            [nextVideoId]: {
              ...prev[nextVideoId],
              status: "failed",
              error: err.message,
            },
          }));
        } finally {
          startingRef.current.delete(nextVideoId);
        }
      };

      startDownload();
    }
  }, [jobs, API_BASE]);

  // ── Poller: polls progress for all active downloading jobs ────────────────
  const pollingRef = useRef<Set<string>>(new Set());

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
              // Trigger save (async, non-blocking)
              triggerSave(job.jobId!, data.filename || "video.mp4");
            } else if (data.status === "failed" || data.status === "cancelled") {
              updates.status = data.status;
              updates.error = data.error || `Download ${data.status}`;
            }

            return { ...prev, [job.videoId]: { ...current, ...updates } };
          });
        } catch (err) {
          console.error("Progress poll error", err);
        } finally {
          pollingRef.current.delete(job.jobId);
        }
      }
    }, 500);

    return () => clearInterval(interval);
  }, [jobs, API_BASE, triggerSave]);

  // ── Public API ────────────────────────────────────────────────────────────
  const addToQueue = useCallback((videoId: string) => {
    setJobs((prev) => {
      const existing = prev[videoId];
      if (existing && ["queued", "downloading"].includes(existing.status)) return prev;
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
    if (job.jobId) {
      fetch(`${API_BASE}/download/cancel/${job.jobId}`, { method: "POST" }).catch(() => {});
    }
  }, [jobs, API_BASE]);

  const removeJob = useCallback((videoId: string) => {
    setJobs((prev) => {
      const next = { ...prev };
      delete next[videoId];
      return next;
    });
  }, []);

  return (
    <DownloadQueueContext.Provider value={{ jobs, addToQueue, cancelJob, removeJob, downloadDir, pickDownloadDir }}>
      {children}
    </DownloadQueueContext.Provider>
  );
}
