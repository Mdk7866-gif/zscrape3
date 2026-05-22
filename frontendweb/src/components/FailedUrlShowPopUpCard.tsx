"use client";

import { useState, useEffect, useCallback } from "react";
import AlertMessagePopUp from "@/components/AlertMessagePopUp";
import ConformationMessagePopUp from "@/components/ConformationMessagePopUp";

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
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
);
const CheckIcon = () => (
  <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const TrashIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);

export default function FailedUrlShowPopUpCard({ folderId, onClose }: FailedUrlShowPopUpCardProps) {
  const [urls, setUrls] = useState<FailedUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "tiktok" | "other">("all");
  const [confirm, setConfirm] = useState<{ type: "single"; id: string } | { type: "all" } | { type: "tab"; tab: "tiktok" | "other" } | null>(null);
  const [alert, setAlert] = useState<{ title: string; message: string; type?: "info" | "success" | "warning" | "error" } | null>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  const fetchUrls = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE}/failed-urls/fetchall?folder_id=${folderId}`);
      if (!res.ok) throw new Error("Failed to load failed URLs");
      const data = await res.json();
      setUrls(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [folderId, API_BASE]);

  useEffect(() => {
    fetchUrls();
  }, [fetchUrls]);

  const tiktokUrls = urls.filter((u) => isTiktokUrl(u.url));
  const otherUrls = urls.filter((u) => !isTiktokUrl(u.url));

  const visibleUrls =
    activeTab === "tiktok" ? tiktokUrls :
    activeTab === "other" ? otherUrls :
    urls;

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
      const text = list.map((u) => u.url).join("\n");
      await navigator.clipboard.writeText(text);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      setAlert({ title: "Copy failed", message: "Could not copy to clipboard.", type: "error" });
    }
  };

  const deleteOne = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/failed-urls/delete/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setUrls((prev) => prev.filter((u) => u.id !== id));
    } catch {
      setAlert({ title: "Delete failed", message: "Could not delete this URL.", type: "error" });
    }
  };

  const deleteAll = async () => {
    try {
      const res = await fetch(`${API_BASE}/failed-urls/delete-all?folder_id=${folderId}`, { method: "DELETE" });
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
        toDelete.map((u) =>
          fetch(`${API_BASE}/failed-urls/delete/${u.id}`, { method: "DELETE" })
        )
      );
      const toDeleteIds = new Set(toDelete.map((u) => u.id));
      setUrls((prev) => prev.filter((u) => !toDeleteIds.has(u.id)));
    } catch {
      setAlert({ title: "Delete failed", message: "Could not delete some URLs.", type: "error" });
    }
  };

  // Derive the list for current bulk actions
  const currentList = visibleUrls;

  const tabClass = (tab: "all" | "tiktok" | "other") =>
    `px-4 py-2 text-xs font-semibold rounded-lg transition-all border ${
      activeTab === tab
        ? "bg-red-600 text-white border-red-600 shadow-sm"
        : "bg-white text-zinc-600 border-zinc-200 hover:border-red-300 hover:text-red-600"
    }`;

  return (
    <>
      {/* Main popup */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh] overflow-hidden border-2 border-red-100">
          {/* Header */}
          <div className="px-6 py-4 border-b border-red-100 bg-red-50 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                <span className="text-red-600 text-lg">⚠️</span>
              </div>
              <div>
                <h2 className="text-base font-bold text-red-900">Failed URLs</h2>
                <p className="text-xs text-red-600">{urls.length} URL{urls.length !== 1 ? "s" : ""} failed to save</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 text-red-400 hover:text-red-700 rounded-lg hover:bg-red-100 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          {/* Tabs */}
          {urls.length > 0 && (
            <div className="px-6 pt-3 pb-0 border-b border-red-100 bg-red-50/40 shrink-0">
              <div className="flex items-center gap-2 pb-3">
                <button onClick={() => setActiveTab("all")} className={tabClass("all")}>
                  All <span className="ml-1 opacity-70">({urls.length})</span>
                </button>
                <button onClick={() => setActiveTab("tiktok")} className={tabClass("tiktok")}>
                  🎵 TikTok <span className="ml-1 opacity-70">({tiktokUrls.length})</span>
                </button>
                <button onClick={() => setActiveTab("other")} className={tabClass("other")}>
                  Other <span className="ml-1 opacity-70">({otherUrls.length})</span>
                </button>
              </div>
            </div>
          )}

          {/* Bulk actions bar */}
          {currentList.length > 0 && (
            <div className="px-6 py-2.5 border-b border-red-100 flex items-center gap-3 bg-white shrink-0">
              <button
                onClick={() => copyAll(currentList)}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-white border border-zinc-200 hover:border-blue-400 hover:text-blue-600 transition-colors text-zinc-600"
              >
                {copiedAll ? <><CheckIcon /> Copied!</> : <><CopyIcon /> Copy All</>}
              </button>
              <button
                onClick={() => {
                  if (activeTab === "all") setConfirm({ type: "all" });
                  else setConfirm({ type: "tab", tab: activeTab });
                }}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-white border border-zinc-200 hover:border-red-400 hover:text-red-600 transition-colors text-zinc-600"
              >
                <TrashIcon /> Delete All
              </button>
              <span className="ml-auto text-xs text-zinc-400 font-medium">{currentList.length} shown</span>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto bg-white">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : error ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-sm text-red-500 bg-red-50 px-4 py-3 rounded-lg border border-red-100">{error}</p>
              </div>
            ) : urls.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
                <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mb-4 text-2xl">✅</div>
                <p className="font-medium text-zinc-600">No failed URLs!</p>
                <p className="text-sm mt-1">All URLs were saved successfully.</p>
              </div>
            ) : currentList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
                <div className="w-14 h-14 rounded-2xl bg-zinc-50 flex items-center justify-center mb-4 text-2xl">🔍</div>
                <p className="font-medium text-zinc-500">No URLs in this category.</p>
              </div>
            ) : (
              <ul className="divide-y divide-red-50">
                {currentList.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 px-6 py-3 hover:bg-red-50/50 group transition-colors">
                    <div className="flex-1 min-w-0">
                      {/* Platform badge */}
                      {isTiktokUrl(item.url) && (
                        <span className="inline-block text-[9px] font-bold px-1.5 py-0.5 bg-black text-white rounded mb-1">TikTok</span>
                      )}
                      <p className="text-xs text-zinc-800 truncate font-mono">{item.url}</p>
                      <p className="text-[10px] text-zinc-400 mt-0.5">
                        {new Date(item.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Copy */}
                      <button
                        onClick={() => copyUrl(item.url, item.id)}
                        title="Copy URL"
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      >
                        {copiedId === item.id ? <CheckIcon /> : <CopyIcon />}
                      </button>
                      {/* Delete */}
                      <button
                        onClick={() => setConfirm({ type: "single", id: item.id })}
                        title="Delete URL"
                        className="p-1.5 rounded-lg text-red-300 hover:text-red-600 hover:bg-red-50 transition-colors"
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
          <div className="px-6 py-4 border-t border-red-100 shrink-0 bg-red-50">
            <button onClick={onClose} className="w-full py-2 text-sm font-medium text-red-900 hover:bg-red-100 rounded-lg transition-colors border border-red-200 bg-white">
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Confirm dialogs */}
      {confirm && (
        <ConformationMessagePopUp
          title={
            confirm.type === "all" ? "Delete All Failed URLs?" :
            confirm.type === "tab" ? `Delete All ${confirm.tab === "tiktok" ? "TikTok" : "Other"} URLs?` :
            "Delete this URL?"
          }
          message={
            confirm.type === "all"
              ? `This will permanently remove all ${urls.length} failed URLs from this folder.`
              : confirm.type === "tab"
              ? `This will permanently remove all ${confirm.tab === "tiktok" ? tiktokUrls.length : otherUrls.length} ${confirm.tab === "tiktok" ? "TikTok" : "other"} URLs.`
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
