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

export type DownloadDirectoryState = "checking" | "ready" | "permission-required" | "unsupported";

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
  downloadDirState: DownloadDirectoryState;
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

  interface FileSystemDirectoryHandle {
    queryPermission?: (descriptor?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
    requestPermission?: (descriptor?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
  }

}

const DOWNLOAD_DIR_DB = "zscrape-download-directory";
const DOWNLOAD_DIR_STORE = "settings";
const DOWNLOAD_DIR_KEY = "selected-directory";

function openDownloadDirDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DOWNLOAD_DIR_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(DOWNLOAD_DIR_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open browser storage."));
  });
}

async function getSavedDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDownloadDirDatabase();
  try {
    return await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
      const request = db.transaction(DOWNLOAD_DIR_STORE, "readonly")
        .objectStore(DOWNLOAD_DIR_STORE)
        .get(DOWNLOAD_DIR_KEY);
      request.onsuccess = () => resolve((request.result as FileSystemDirectoryHandle | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error("Could not read browser storage."));
    });
  } finally {
    db.close();
  }
}

async function saveDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDownloadDirDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(DOWNLOAD_DIR_STORE, "readwrite")
        .objectStore(DOWNLOAD_DIR_STORE)
        .put(handle, DOWNLOAD_DIR_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("Could not save browser storage."));
    });
  } finally {
    db.close();
  }
}

export function DownloadQueueProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<Record<string, DownloadJob>>({});
  const [dbStatuses, setDbStatuses] = useState<Record<string, DownloadStatus>>({});
  const [downloadDir, setDownloadDir] = useState<string | null>(null);
  const [downloadDirState, setDownloadDirState] = useState<DownloadDirectoryState>("checking");
  // Replaces a native window.alert(): browser modals block the whole tab and
  // look nothing like the rest of the app's popups.
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);
  const dirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const downloadedJobIds = useRef<Set<string>>(new Set());
  const startingRef = useRef<Set<string>>(new Set());
  const pollingRef = useRef<Set<string>>(new Set());
  const saveFallbackNoticeShown = useRef(false);

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

  // A File System Access handle can be structured-cloned into IndexedDB. The
  // path itself is intentionally never sent to the backend: it belongs to the
  // user's computer, and browser permission remains under the user's control.
  useEffect(() => {
    let active = true;

    const restoreDirectory = async () => {
      if (!window.showDirectoryPicker) {
        if (active) setDownloadDirState("unsupported");
        return;
      }

      try {
        const handle = await getSavedDirectoryHandle();
        if (!active || !handle) {
          if (active) setDownloadDirState("ready");
          return;
        }

        dirHandleRef.current = handle;
        if (!handle.queryPermission) {
          setDownloadDirState("permission-required");
          return;
        }
        const permission = await handle.queryPermission({ mode: "readwrite" });
        if (!active) return;
        if (permission === "granted") {
          setDownloadDir(handle.name);
          setDownloadDirState("ready");
        } else {
          setDownloadDirState("permission-required");
        }
      } catch (error) {
        console.error("Could not restore download folder", error);
        if (!active) return;
        dirHandleRef.current = null;
        setDownloadDirState("ready");
        setAlert({
          title: "Saved download folder unavailable",
          message: "Your browser could not restore the saved folder. Choose a folder again, or downloads will use your browser's default Downloads folder.",
        });
      }
    };

    restoreDirectory();
    return () => { active = false; };
  }, []);

  // Directory picker
  const pickDownloadDir = useCallback(async () => {
    if (!window.showDirectoryPicker) {
      setDownloadDirState("unsupported");
      setAlert({
        title: "Folder selection unavailable",
        message:
          "This browser doesn't support choosing a save folder. Downloads will go to your browser's default Downloads folder instead.",
      });
      return;
    }

    if (dirHandleRef.current && downloadDirState === "permission-required") {
      try {
        if (!dirHandleRef.current.requestPermission) {
          throw new Error("This browser cannot restore folder permission.");
        }
        const permission = await dirHandleRef.current.requestPermission({ mode: "readwrite" });
        if (permission === "granted") {
          setDownloadDir(dirHandleRef.current.name);
          setDownloadDirState("ready");
          return;
        }
      } catch (error) {
        console.error("Saved folder permission error", error);
      }

      dirHandleRef.current = null;
      setDownloadDirState("ready");
      setAlert({
        title: "Folder access was not granted",
        message: "The saved folder was left unchanged. Select a folder again to save downloads there, or use your browser's default Downloads folder.",
      });
      return;
    }

    try {
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });
      dirHandleRef.current = handle;
      setDownloadDir(handle.name);
      setDownloadDirState("ready");
      try {
        await saveDirectoryHandle(handle);
      } catch (error) {
        console.error("Could not save download folder", error);
        setAlert({
          title: "Folder selected for this session",
          message: "Your browser could not remember this folder for future visits. Downloads will still save there until you close this tab.",
        });
      }
    } catch (e) {
      // AbortError just means the user closed the picker — not worth logging.
      if (!(e instanceof DOMException) || e.name !== "AbortError") {
        console.error("Directory picker error", e);
        setAlert({
          title: "Could not select a download folder",
          message: "No folder was changed. You can try again, or downloads will use your browser's default Downloads folder.",
        });
      }
    }
  }, [downloadDirState]);

  // ── Trigger file save ──────────────────────────────────────────────────────
  const triggerSave = useCallback(async (jobId: string, filename: string) => {
    if (downloadedJobIds.current.has(jobId)) return;
    downloadedJobIds.current.add(jobId);
    const fileUrl = apiUrl(`/download/file/${jobId}`);
    let downloadedBlob: Blob | null = null;

    if (dirHandleRef.current) {
      try {
        if (!dirHandleRef.current.queryPermission) {
          throw new Error("This browser cannot check folder permission.");
        }
        const permission = await dirHandleRef.current.queryPermission({ mode: "readwrite" });
        if (permission !== "granted") throw new Error("Folder permission is no longer granted.");
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error("Fetch failed");
        downloadedBlob = await res.blob();
        const fh = await dirHandleRef.current.getFileHandle(filename, { create: true });
        const createWritable = fh.createWritable;
        if (!createWritable) throw new Error("This browser cannot write to the selected folder.");
        const writable = await createWritable.call(fh);
        await writable.write(downloadedBlob);
        await writable.close();
        return;
      } catch (e) {
        console.error("Directory save failed, falling back", e);
        setDownloadDir(null);
        setDownloadDirState("permission-required");
        if (!saveFallbackNoticeShown.current) {
          saveFallbackNoticeShown.current = true;
          setAlert({
            title: "Saved folder needs permission",
            message: "The video was sent to your browser's default Downloads folder instead. Select Allow access to use your saved folder again.",
          });
        }
      }
    }

    const a = document.createElement("a");
    const blobUrl = downloadedBlob ? URL.createObjectURL(downloadedBlob) : null;
    a.href = blobUrl ?? fileUrl;
    a.download = filename || "video.mp4";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (blobUrl) setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
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
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Failed to start download";
          setJobs((prev) => ({
            ...prev,
            [nextVideoId]: { ...prev[nextVideoId], status: "failed", error: message },
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
      downloadDir, downloadDirState, pickDownloadDir,
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
