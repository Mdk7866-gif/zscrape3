"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useDownloadQueue } from "@/components/DownloadQueueContext";
import { useAdmin } from "@/components/AdminContext";
import ConformationMessagePopUp from "@/components/ConformationMessagePopUp";
import { apiFetch } from "@/lib/api";

interface Folder {
  id: string;
  name: string;
}

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [newFolderName, setNewFolderName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Navigation guard state
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  const { hasActiveDownloads } = useDownloadQueue();
  const { isAdmin, checking } = useAdmin();

  const fetchFolders = async () => {
    try {
      setLoading(true);
      const res = await apiFetch("/folder/fetchall");
      if (!res.ok) throw new Error("Failed to fetch folders");
      const data = await res.json();
      setFolders(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load folders");
    } finally {
      setLoading(false);
    }
  };

  const createFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      setError(null);
      const res = await apiFetch("/folder/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newFolderName }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to create folder");
      }
      setNewFolderName("");
      fetchFolders();
    } catch (err: any) {
      setError(err.message || "Failed to create folder");
    }
  };

  const [folderToDelete, setFolderToDelete] = useState<{ id: string; name: string } | null>(null);

  const confirmDeleteFolder = async (id: string) => {
    try {
      setError(null);
      const res = await apiFetch(`/folder/delete/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete folder");
      fetchFolders();
    } catch (err: any) {
      setError(err.message || "Failed to delete folder");
    }
  };

  // Refetch when the workspace changes (admin login/logout swaps which folders
  // exist). Waits for `checking` so the first load doesn't fire before a stored
  // token has been validated, which would fetch the public list then replace it.
  useEffect(() => {
    if (checking) return;
    fetchFolders();
  }, [isAdmin, checking]);

  // Guard: intercept navigation while downloads are active
  const handleNavClick = (e: React.MouseEvent, href: string) => {
    if (hasActiveDownloads && href !== pathname) {
      e.preventDefault();
      setPendingHref(href);
    }
    // else allow normal Link navigation
  };

  const confirmNavigation = () => {
    if (pendingHref) {
      setPendingHref(null);
      onClose?.();
      router.push(pendingHref);
    }
  };

  return (
    <>
      <aside className="w-full h-full bg-zinc-50 text-zinc-900 border-r border-zinc-200 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-zinc-200 flex items-center justify-between shrink-0">
          <h2 className="font-bold text-xs text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
            {isAdmin && <span className="text-[11px]">🔒</span>}
            {isAdmin ? "Admin Folders" : "Folders"}
          </h2>
          <div className="flex items-center gap-2">
            {loading && (
              <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            )}
            {hasActiveDownloads && (
              <span className="flex items-center gap-1 text-[10px] text-blue-600 font-semibold bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse inline-block" />
                Downloading
              </span>
            )}
            {onClose && (
              <button onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-700 lg:hidden">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Folder list */}
        <div className="flex-1 overflow-y-auto py-2">
          <div className="px-2 mb-4">
            <Link
              href="/"
              onClick={(e) => handleNavClick(e, "/")}
              className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                pathname === "/" ? "bg-blue-50 text-blue-700 font-medium" : "text-zinc-700 hover:bg-zinc-200/60"
              }`}
            >
              <span className="shrink-0 text-lg">🏠</span>
              <span>Home</span>
            </Link>
          </div>

          {error && (
            <div className="mx-3 mb-2 text-xs text-red-600 bg-red-50 border border-red-200 p-2 rounded">
              {error}
            </div>
          )}

          {folders.length === 0 && !loading ? (
            <div className="text-xs text-zinc-400 italic px-4 py-3">
              {isAdmin ? "No admin folders yet." : "No folders yet."}
            </div>
          ) : (
            <ul className="space-y-0.5 px-2">
              {folders.map((folder) => {
                const isActive = pathname === `/folder/${folder.id}`;
                const href = `/folder/${folder.id}`;
                return (
                  <li key={folder.id} className="group">
                    <div className={`flex items-center rounded-lg transition-colors ${isActive ? "bg-blue-50" : "hover:bg-zinc-200/60"}`}>
                      <Link
                        href={href}
                        onClick={(e) => handleNavClick(e, href)}
                        className={`flex-1 flex items-center gap-2 px-3 py-2 text-sm min-w-0 ${isActive ? "text-blue-700 font-medium" : "text-zinc-700"}`}
                      >
                        <span className="shrink-0 text-lg">📁</span>
                        <span className="truncate">{folder.name}</span>
                      </Link>
                      <button
                        onClick={() => setFolderToDelete({ id: folder.id, name: folder.name })}
                        className="shrink-0 mr-1 p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded opacity-100 transition-all focus:outline-none"
                        title="Delete Folder"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Create folder form */}
        <div className="p-3 border-t border-zinc-200 bg-zinc-50/80 shrink-0">
          <form onSubmit={createFolder} className="flex flex-col gap-2">
            <input
              type="text"
              placeholder="New folder name..."
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              className="w-full bg-white border border-zinc-300 rounded-lg px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
            />
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg text-sm transition-colors flex items-center justify-center gap-1.5 shadow-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" /><path d="M12 5v14" />
              </svg>
              Create Folder
            </button>
          </form>
        </div>
      </aside>

      {/* Navigation guard confirmation */}
      {/* Pending navigation confirmation */}
      {pendingHref && (
        <ConformationMessagePopUp
          title="Cancel active downloads?"
          message="You have videos downloading right now. Navigating away will cancel all active downloads. Are you sure you want to leave?"
          confirmLabel="Leave & Cancel Downloads"
          cancelLabel="Stay"
          danger
          onConfirm={confirmNavigation}
          onCancel={() => setPendingHref(null)}
        />
      )}

      {/* Delete Folder confirmation */}
      {folderToDelete && (
        <ConformationMessagePopUp
          title="Delete Folder?"
          message={`Are you sure you want to delete "${folderToDelete.name}"? All associated videos will also be deleted.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => {
            confirmDeleteFolder(folderToDelete.id);
            setFolderToDelete(null);
          }}
          onCancel={() => setFolderToDelete(null)}
        />
      )}
    </>
  );
}
