"use client";

import { useState, useEffect, useCallback } from "react";
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
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // Navigation guard state
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<{ id: string; name: string } | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  const { hasActiveDownloads, removeDownloadDirectory } = useDownloadQueue();
  const { isAdmin, checking } = useAdmin();

  const fetchFolders = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiFetch("/folder/fetchall");
      if (!res.ok) throw new Error("Failed to fetch folders");
      const data = await res.json();
      setFolders(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load folders");
    } finally {
      setLoading(false);
    }
  }, []);

  const createFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newFolderName.trim();
    if (!name || creating) return;
    try {
      setCreating(true);
      setError(null);
      const res = await apiFetch("/folder/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to create folder");
      }
      setNewFolderName("");
      fetchFolders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create folder");
    } finally {
      setCreating(false);
    }
  };

  const confirmDeleteFolder = async (id: string) => {
    try {
      setError(null);
      const res = await apiFetch(`/folder/delete/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete folder");
      // The backend deletion succeeded, so its browser-only folder override is
      // now stale and can safely be removed as well.
      await removeDownloadDirectory(id).catch((cleanupError) => {
        console.error("Could not remove saved download folder", cleanupError);
      });
      fetchFolders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete folder");
    }
  };

  // Refetch when the workspace changes (admin login/logout swaps which folders
  // exist). Waits for `checking` so the first load doesn't fire before a stored
  // token has been validated, which would fetch the public list then replace it.
  useEffect(() => {
    if (checking) return;
    fetchFolders();
  }, [isAdmin, checking, fetchFolders]);

  // Guard: intercept navigation while downloads are active
  const handleNavClick = (e: React.MouseEvent, href: string) => {
    if (hasActiveDownloads && href !== pathname) {
      e.preventDefault();
      setPendingHref(href);
      return;
    }
    onClose?.();
  };

  const confirmNavigation = () => {
    if (pendingHref) {
      setPendingHref(null);
      onClose?.();
      router.push(pendingHref);
    }
  };

  const visibleFolders = query.trim()
    ? folders.filter((f) => f.name.toLowerCase().includes(query.trim().toLowerCase()))
    : folders;

  const isHome = pathname === "/";

  return (
    <>
      <aside className="flex h-full w-full flex-col border-r border-line bg-surface/80 backdrop-blur-xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-4 py-3.5">
          <h2 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-subtle">
            {isAdmin && (
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            )}
            {isAdmin ? "Admin Folders" : "Folders"}
            {!loading && folders.length > 0 && (
              <span className="ml-0.5 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted">
                {folders.length}
              </span>
            )}
          </h2>
          <div className="flex items-center gap-2">
            {hasActiveDownloads && (
              <span className="flex items-center gap-1 rounded-full border border-accent-line bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                <span className="hidden xl:inline">Downloading</span>
              </span>
            )}
            {onClose && (
              <button
                onClick={onClose}
                aria-label="Close menu"
                className="rounded-lg p-1.5 text-subtle transition-colors hover:bg-surface-2 hover:text-fg lg:hidden"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Home + search */}
        <div className="shrink-0 space-y-2 px-3 pt-3">
          <Link
            href="/"
            onClick={(e) => handleNavClick(e, "/")}
            aria-current={isHome ? "page" : undefined}
            className={`group relative flex items-center gap-2.5 overflow-hidden rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
              isHome
                ? "bg-accent-soft text-accent"
                : "text-muted hover:bg-surface-2 hover:text-fg"
            }`}
          >
            {isHome && <span className="absolute inset-y-1.5 left-0 w-1 rounded-r-full bg-accent" />}
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" />
            </svg>
            Home
          </Link>

          {/* Only worth showing once the list is long enough to hunt through. */}
          {folders.length > 6 && (
            <div className="relative">
              <svg className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter folders…"
                aria-label="Filter folders"
                className="w-full rounded-lg border border-line bg-surface-2 py-2 pl-9 pr-3 text-xs text-fg placeholder-subtle transition-colors focus:border-accent focus:bg-surface focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Folder list */}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {error && (
            <div className="mb-2 rounded-lg border border-danger-line bg-danger-soft p-2.5 text-xs text-danger">
              {error}
            </div>
          )}

          {loading ? (
            /* Fixed-height rows matching real folder rows, so the list doesn't
               jump when data arrives. */
            <ul className="space-y-1" aria-hidden>
              {[80, 60, 72, 52, 68].map((w, i) => (
                <li key={i} className="flex h-10 items-center gap-2.5 px-3">
                  <span className="skeleton h-4 w-4 shrink-0 rounded" />
                  <span className="skeleton h-3 rounded" style={{ width: `${w}%` }} />
                </li>
              ))}
            </ul>
          ) : folders.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center">
              <div className="mx-auto mb-2.5 grid h-10 w-10 place-items-center rounded-xl bg-surface-2 text-subtle">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                </svg>
              </div>
              <p className="text-xs font-medium text-muted">
                {isAdmin ? "No admin folders yet" : "No folders yet"}
              </p>
              <p className="mt-1 text-[11px] text-subtle">Create one below to get started.</p>
            </div>
          ) : visibleFolders.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-subtle">
              No folders match “{query}”.
            </p>
          ) : (
            <ul className="space-y-1">
              {visibleFolders.map((folder) => {
                const href = `/folder/${folder.id}`;
                const isActive = pathname === href;
                return (
                  <li key={folder.id} className="group relative">
                    <div
                      className={`relative flex items-center overflow-hidden rounded-xl transition-colors ${
                        isActive ? "bg-accent-soft" : "hover:bg-surface-2"
                      }`}
                    >
                      {isActive && (
                        <span className="absolute inset-y-1.5 left-0 w-1 rounded-r-full bg-accent" />
                      )}
                      <Link
                        href={href}
                        onClick={(e) => handleNavClick(e, href)}
                        aria-current={isActive ? "page" : undefined}
                        className={`flex min-w-0 flex-1 items-center gap-2.5 py-2.5 pl-3 pr-1 text-sm ${
                          isActive ? "font-semibold text-accent" : "text-muted group-hover:text-fg"
                        }`}
                      >
                        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                        </svg>
                        <span className="truncate">{folder.name}</span>
                      </Link>
                      <button
                        onClick={() => setFolderToDelete({ id: folder.id, name: folder.name })}
                        aria-label={`Delete folder ${folder.name}`}
                        title="Delete folder"
                        /* Hidden until hover on pointer devices; always shown on
                           touch, where there is no hover to reveal it. */
                        className="mr-1.5 shrink-0 rounded-lg p-1.5 text-subtle opacity-100 transition-all hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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
        <div className="shrink-0 border-t border-line bg-surface-2/60 p-3">
          <form onSubmit={createFolder} className="flex flex-col gap-2">
            <input
              type="text"
              placeholder="New folder name…"
              aria-label="New folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg placeholder-subtle transition-all focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
            <button
              type="submit"
              disabled={!newFolderName.trim() || creating}
              className="group relative flex w-full items-center justify-center gap-1.5 overflow-hidden rounded-lg bg-gradient-to-r from-accent to-accent-2 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition-all hover:shadow-xl hover:shadow-accent/35 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
            >
              {creating ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12h14" /><path d="M12 5v14" />
                </svg>
              )}
              {creating ? "Creating…" : "Create Folder"}
            </button>
          </form>
        </div>
      </aside>

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

      {/* Delete folder confirmation */}
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
