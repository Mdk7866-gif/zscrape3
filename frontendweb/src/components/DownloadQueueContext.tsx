"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

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
}

const DownloadQueueContext = createContext<DownloadQueueContextType | undefined>(undefined);

export function useDownloadQueue() {
  const context = useContext(DownloadQueueContext);
  if (!context) {
    throw new Error("useDownloadQueue must be used within a DownloadQueueProvider");
  }
  return context;
}

export function DownloadQueueProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<Record<string, DownloadJob>>({});
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  // Cleanup on page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      const activeJobs = Object.values(jobs).filter(
        (j) => j.jobId && (j.status === "downloading" || j.status === "queued")
      );
      // Fire-and-forget cancel requests
      activeJobs.forEach((job) => {
        fetch(`${API_BASE}/download/cancel/${job.jobId}`, {
          method: "POST",
          keepalive: true,
        }).catch(() => {});
      });
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [jobs, API_BASE]);

  // The actual queue runner
  useEffect(() => {
    const pendingVideoIds = Object.keys(jobs).filter(
      (id) => jobs[id].status === "queued" && !jobs[id].jobId
    );
    const activeJobs = Object.values(jobs).filter(
      (j) => j.status === "downloading" || (j.status === "queued" && j.jobId)
    );

    // Limit to 1 active download at a time to prevent IP bans
    if (activeJobs.length === 0 && pendingVideoIds.length > 0) {
      const nextVideoId = pendingVideoIds[0];
      
      // Start the download API call
      const startDownload = async () => {
        try {
          // Add a 2-second delay before starting the next video (anti-ban measure)
          await new Promise(resolve => setTimeout(resolve, 2000));
          
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
              phase: "starting"
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
        }
      };
      
      startDownload();
    }
  }, [jobs, API_BASE]);

  // Poller for active jobs
  useEffect(() => {
    const activeJobs = Object.values(jobs).filter(
      (j) => j.jobId && j.status === "downloading"
    );
    if (activeJobs.length === 0) return;

    const interval = setInterval(() => {
      activeJobs.forEach(async (job) => {
        if (!job.jobId) return;
        try {
          const res = await fetch(`${API_BASE}/download/progress/${job.jobId}`);
          if (!res.ok) {
            if (res.status === 404) {
              setJobs((prev) => ({
                ...prev,
                [job.videoId]: { ...prev[job.videoId], status: "cancelled" },
              }));
            }
            return;
          }
          const data = await res.json();
          
          setJobs((prev) => {
            const current = prev[job.videoId];
            if (!current || current.status !== "downloading") return prev;

            const updates: Partial<DownloadJob> = {
              progress: data.progress || 0,
              phase: data.phase || "downloading",
            };

            if (data.status === "completed") {
              updates.status = "completed";
              updates.progress = 100;
              updates.phase = "done";
              
              // Trigger download
              const a = document.createElement("a");
              a.href = `${API_BASE}/download/file/${job.jobId}`;
              a.download = "";
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
            } else if (data.status === "failed" || data.status === "cancelled") {
              updates.status = data.status;
              updates.error = data.error || `Download ${data.status}`;
            }

            return {
              ...prev,
              [job.videoId]: { ...current, ...updates },
            };
          });
        } catch (err) {
          console.error("Progress poll error", err);
        }
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [jobs, API_BASE]);

  const addToQueue = useCallback((videoId: string) => {
    setJobs((prev) => {
      if (prev[videoId] && ["queued", "downloading"].includes(prev[videoId].status)) {
        return prev;
      }
      return {
        ...prev,
        [videoId]: {
          videoId,
          jobId: null,
          status: "queued",
          progress: 0,
          phase: "queued",
        },
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
      try {
        await fetch(`${API_BASE}/download/cancel/${job.jobId}`, { method: "POST" });
      } catch (err) {
        console.error("Failed to cancel job", err);
      }
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
    <DownloadQueueContext.Provider value={{ jobs, addToQueue, cancelJob, removeJob }}>
      {children}
    </DownloadQueueContext.Provider>
  );
}
