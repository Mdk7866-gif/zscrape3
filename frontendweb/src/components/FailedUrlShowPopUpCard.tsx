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

export default function FailedUrlShowPopUpCard({ folderId, onClose }: FailedUrlShowPopUpCardProps) {
  const [urls, setUrls] = useState<FailedUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [confirm, setConfirm] = useState<{ type: "single"; id: string } | { type: "all" } | null>(null);
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

  const copyUrl = async (url: string, id: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setAlert({ title: "Copy failed", message: "Could not copy to clipboard.", type: "error" });
    }
  };

  const copyAll = async () => {
    try {
      const text = urls.map((u) => u.url).join("\n");
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

  return (
    <>
      {/* Main popup */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[80vh] overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                <span className="text-amber-600 text-lg">⚠️</span>
              </div>
              <div>
                <h2 className="text-base font-bold text-zinc-900">Failed URLs</h2>
                <p className="text-xs text-zinc-500">{urls.length} URL{urls.length !== 1 ? "s" : ""} failed to save</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-zinc-700 rounded-lg hover:bg-zinc-100 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          {/* Bulk actions bar */}
          {urls.length > 0 && (
            <div className="px-6 py-3 border-b border-zinc-100 flex items-center gap-3 bg-zinc-50 shrink-0">
              <button
                onClick={copyAll}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-white border border-zinc-200 hover:border-blue-400 hover:text-blue-600 transition-colors"
              >
                {copiedAll ? (
                  <><svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12"/></svg> Copied!</>
                ) : (
                  <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy All</>
                )}
              </button>
              <button
                onClick={() => setConfirm({ type: "all" })}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-white border border-zinc-200 hover:border-red-400 hover:text-red-600 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                Delete All
              </button>
              <span className="ml-auto text-xs text-zinc-400">{urls.length} total</span>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
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
            ) : (
              <ul className="divide-y divide-zinc-100">
                {urls.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 px-6 py-3 hover:bg-zinc-50 group">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-700 truncate font-mono">{item.url}</p>
                      <p className="text-[10px] text-zinc-400 mt-0.5">
                        {new Date(item.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Copy individual */}
                      <button
                        onClick={() => copyUrl(item.url, item.id)}
                        title="Copy URL"
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      >
                        {copiedId === item.id ? (
                          <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12"/></svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                        )}
                      </button>
                      {/* Delete individual */}
                      <button
                        onClick={() => setConfirm({ type: "single", id: item.id })}
                        title="Delete URL"
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-zinc-100 shrink-0">
            <button onClick={onClose} className="w-full py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 rounded-lg transition-colors">
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Confirm dialogs */}
      {confirm && (
        <ConformationMessagePopUp
          title={confirm.type === "all" ? "Delete All Failed URLs?" : "Delete this URL?"}
          message={
            confirm.type === "all"
              ? `This will permanently remove all ${urls.length} failed URLs from this folder.`
              : "This will permanently remove this URL from the failed list."
          }
          confirmLabel="Delete"
          danger
          onConfirm={() => {
            if (confirm.type === "all") deleteAll();
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
