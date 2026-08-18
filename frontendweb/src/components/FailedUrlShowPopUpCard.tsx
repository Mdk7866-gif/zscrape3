"use client";

import { useState, useEffect, useCallback } from "react";
import AlertMessagePopUp from "@/components/AlertMessagePopUp";
import ConformationMessagePopUp from "@/components/ConformationMessagePopUp";
import { apiFetch } from "@/lib/api";
import { useModal } from "@/lib/useModal";

interface FailedUrl {
  id: string;
  folder_id: string;
  url: string;
  created_at: string;
}

interface FailedUrlShowPopUpCardProps {
  folderId: string;
  onClose: () => void;
}

function isTiktokUrl(url: string) {
  return url.includes("tiktok.com");
}

const CopyIcon = () => (
  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
);
const CheckIcon = () => (
  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const TrashIcon = () => (
  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);

type Tab = "all" | "tiktok" | "other";

export default function FailedUrlShowPopUpCard({ folderId, onClose }: FailedUrlShowPopUpCardProps) {
  const [urls, setUrls] = useState<FailedUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [confirm, setConfirm] = useState<
    { type: "single"; id: string } | { type: "all" } | { type: "tab"; tab: "tiktok" | "other" } | null
  >(null);
  const [alert, setAlert] = useState<{
    title: string;
    message: string;
    type?: "info" | "success" | "warning" | "error";
  } | null>(null);

  const dialogRef = useModal<HTMLDivElement>(onClose);

  const fetchUrls = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch(`/failed-urls/fetchall?folder_id=${folderId}`);
      if (!res.ok) throw new Error("Failed to load failed URLs");
      const data = await res.json();
      setUrls(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load failed URLs");
    } finally {
      setLoading(false);
    }
  }, [folderId]);

  useEffect(() => {
    fetchUrls();
  }, [fetchUrls]);

  const tiktokUrls = urls.filter((u) => isTiktokUrl(u.url));
  const otherUrls = urls.filter((u) => !isTiktokUrl(u.url));

  const currentList =
    activeTab === "tiktok" ? tiktokUrls : activeTab === "other" ? otherUrls : urls;

  const copyUrl = async (url: string, id: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setAlert({ title: "Copy failed", message: "Could not copy to clipboard.", type: "error" });
    }
  };

  const copyAll = async (list: FailedUrl[]) => {
    try {
      await navigator.clipboard.writeText(list.map((u) => u.url).join("\n"));
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      setAlert({ title: "Copy failed", message: "Could not copy to clipboard.", type: "error" });
    }
  };

  const deleteOne = async (id: string) => {
    try {
      const res = await apiFetch(`/failed-urls/delete/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setUrls((prev) => prev.filter((u) => u.id !== id));
    } catch {
      setAlert({ title: "Delete failed", message: "Could not delete this URL.", type: "error" });
    }
  };

  const deleteAll = async () => {
    try {
      const res = await apiFetch(`/failed-urls/delete-all?folder_id=${folderId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete all failed");
      setUrls([]);
    } catch {
      setAlert({ title: "Delete failed", message: "Could not delete all URLs.", type: "error" });
    }
  };

  const deleteByTab = async (tab: "tiktok" | "other") => {
    const toDelete = tab === "tiktok" ? tiktokUrls : otherUrls;
    try {
      await Promise.all(
        toDelete.map((u) => apiFetch(`/failed-urls/delete/${u.id}`, { method: "DELETE" }))
      );
      const ids = new Set(toDelete.map((u) => u.id));
      setUrls((prev) => prev.filter((u) => !ids.has(u.id)));
    } catch {
      setAlert({ title: "Delete failed", message: "Could not delete some URLs.", type: "error" });
    }
  };

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: "all", label: "All", count: urls.length },
    { key: "tiktok", label: "TikTok", count: tiktokUrls.length },
    { key: "other", label: "Other", count: otherUrls.length },
  ];

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/50 p-3 backdrop-blur-sm sm:p-4"
        onClick={onClose}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="failed-title"
          onClick={(e) => e.stopPropagation()}
          className="flex max-h-[92dvh] w-full max-w-2xl animate-pop-in flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line bg-danger-soft/60 px-4 py-3.5 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-danger-soft text-danger">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
                  <path d="M12 9v4M12 17h.01" />
                </svg>
              </span>
              <div className="min-w-0">
                <h2 id="failed-title" className="truncate text-base font-bold">
                  Failed URLs
                </h2>
                <p className="text-xs text-muted">
                  {loading
                    ? "Loading…"
                    : `${urls.length} URL${urls.length !== 1 ? "s" : ""} failed to save`}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 rounded-lg p-1.5 text-subtle transition-colors hover:bg-surface-3 hover:text-fg"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Tabs + bulk actions */}
          {urls.length > 0 && (
            <div className="shrink-0 space-y-2.5 border-b border-line px-4 py-3 sm:px-6">
              <div className="flex flex-wrap items-center gap-1.5" role="tablist">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    role="tab"
                    aria-selected={activeTab === t.key}
                    onClick={() => setActiveTab(t.key)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                      activeTab === t.key
                        ? "border-danger bg-danger text-white shadow-sm"
                        : "border-line bg-surface text-muted hover:border-danger-line hover:text-danger"
                    }`}
                  >
                    {t.label}
                    <span className="ml-1.5 tabular-nums opacity-70">{t.count}</span>
                  </button>
                ))}
              </div>

              {currentList.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => copyAll(currentList)}
                    className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent-line hover:text-accent"
                  >
                    {copiedAll ? (
                      <>
                        <span className="text-ok"><CheckIcon /></span> Copied!
                      </>
                    ) : (
                      <>
                        <CopyIcon /> Copy all
                      </>
                    )}
                  </button>
                  <button
                    onClick={() =>
                      setConfirm(
                        activeTab === "all"
                          ? { type: "all" }
                          : { type: "tab", tab: activeTab }
                      )
                    }
                    className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-danger-line hover:text-danger"
                  >
                    <TrashIcon /> Delete all
                  </button>
                  <span className="ml-auto text-xs font-medium tabular-nums text-subtle">
                    {currentList.length} shown
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Content */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              /* Fixed-height skeleton rows so the dialog body doesn't jump when
                 the list arrives. */
              <ul className="divide-y divide-line" aria-hidden>
                {[0, 1, 2, 3, 4].map((i) => (
                  <li key={i} className="flex h-[62px] items-center gap-3 px-4 sm:px-6">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="skeleton h-3 w-[70%]" />
                      <div className="skeleton h-2.5 w-24" />
                    </div>
                    <div className="skeleton h-7 w-7 rounded-lg" />
                    <div className="skeleton h-7 w-7 rounded-lg" />
                  </li>
                ))}
              </ul>
            ) : error ? (
              <div className="flex items-center justify-center py-14 px-6">
                <p className="rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger">
                  {error}
                </p>
              </div>
            ) : urls.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-ok-soft text-ok">
                  <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <p className="font-semibold">No failed URLs</p>
                <p className="mt-1 text-sm text-muted">All URLs were saved successfully.</p>
              </div>
            ) : currentList.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-surface-2 text-subtle">
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-muted">No URLs in this category.</p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {currentList.map((item) => (
                  <li
                    key={item.id}
                    className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2 sm:px-6"
                  >
                    <div className="min-w-0 flex-1">
                      {isTiktokUrl(item.url) && (
                        <span className="mb-1 inline-block rounded bg-fg px-1.5 py-0.5 text-[9px] font-bold text-bg">
                          TikTok
                        </span>
                      )}
                      <p className="truncate font-mono text-xs" title={item.url}>
                        {item.url}
                      </p>
                      <p className="mt-0.5 text-[10px] text-subtle">
                        {new Date(item.created_at).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => copyUrl(item.url, item.id)}
                        title="Copy URL"
                        aria-label="Copy URL"
                        className="rounded-lg p-2 text-subtle transition-colors hover:bg-accent-soft hover:text-accent"
                      >
                        {copiedId === item.id ? (
                          <span className="text-ok"><CheckIcon /></span>
                        ) : (
                          <CopyIcon />
                        )}
                      </button>
                      <button
                        onClick={() => setConfirm({ type: "single", id: item.id })}
                        title="Delete URL"
                        aria-label="Delete URL"
                        className="rounded-lg p-2 text-subtle transition-colors hover:bg-danger-soft hover:text-danger"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-line bg-surface-2/70 px-4 py-3.5 sm:px-6">
            <button
              onClick={onClose}
              className="w-full rounded-lg border border-line bg-surface py-2.5 text-sm font-semibold text-muted transition-colors hover:bg-surface-3 hover:text-fg"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Confirm dialogs */}
      {confirm && (
        <ConformationMessagePopUp
          title={
            confirm.type === "all"
              ? "Delete all failed URLs?"
              : confirm.type === "tab"
              ? `Delete all ${confirm.tab === "tiktok" ? "TikTok" : "other"} URLs?`
              : "Delete this URL?"
          }
          message={
            confirm.type === "all"
              ? `This will permanently remove all ${urls.length} failed URLs from this folder.`
              : confirm.type === "tab"
              ? `This will permanently remove all ${
                  confirm.tab === "tiktok" ? tiktokUrls.length : otherUrls.length
                } ${confirm.tab === "tiktok" ? "TikTok" : "other"} URLs.`
              : "This will permanently remove this URL from the failed list."
          }
          confirmLabel="Delete"
          danger
          onConfirm={() => {
            if (confirm.type === "all") deleteAll();
            else if (confirm.type === "tab") deleteByTab(confirm.tab);
            else deleteOne(confirm.id);
            setConfirm(null);
          }}
          onCancel={() => setConfirm(null)}
        />
      )}

      {alert && (
        <AlertMessagePopUp
          title={alert.title}
          message={alert.message}
          type={alert.type}
          onClose={() => setAlert(null)}
        />
      )}
    </>
  );
}
