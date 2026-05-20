"use client";

import { useState, useEffect } from "react";

interface Folder {
  id: string;
  name: string;
}

export default function Sidebar() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [newFolderName, setNewFolderName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  const fetchFolders = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/folder/fetchall`);
      if (!res.ok) {
        throw new Error("Failed to fetch folders");
      }
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
      const res = await fetch(`${API_BASE}/folder/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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

  const deleteFolder = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete folder "${name}"? This will delete all associated videos and failed URLs.`)) {
      return;
    }

    try {
      setError(null);
      const res = await fetch(`${API_BASE}/folder/delete/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to delete folder");
      }

      fetchFolders();
    } catch (err: any) {
      setError(err.message || "Failed to delete folder");
    }
  };

  useEffect(() => {
    fetchFolders();
  }, []);

  return (
    <aside className="w-64 bg-zinc-50 text-zinc-900 border-r border-zinc-200 flex flex-col h-full">
      <div className="p-4 border-b border-zinc-200 flex items-center justify-between">
        <h2 className="font-bold text-sm text-zinc-500 uppercase tracking-wider">folders</h2>
        {loading && (
          <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 p-2 rounded">
            {error}
          </div>
        )}

        {folders.length === 0 && !loading ? (
          <div className="text-xs text-zinc-400 italic p-2">No folders found.</div>
        ) : (
          <ul className="space-y-1">
            {folders.map((folder) => (
              <li
                key={folder.id}
                className="group flex items-center justify-between p-2 rounded hover:bg-zinc-200/60 transition-colors text-sm text-zinc-700 hover:text-zinc-950"
              >
                <span className="truncate pr-2 flex items-center gap-2">
                  <span className="text-zinc-400">📁</span>
                  {folder.name}
                </span>
                <button
                  onClick={() => deleteFolder(folder.id, folder.name)}
                  className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-600 p-1 rounded transition-all duration-150"
                  title="Delete Folder"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 6h18" />
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="p-4 border-t border-zinc-200 bg-zinc-50/80">
        <form onSubmit={createFolder} className="flex flex-col gap-2">
          <input
            type="text"
            placeholder="New folder name..."
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            className="w-full bg-white border border-zinc-300 rounded px-3 py-1.5 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
          />
          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-1.5 rounded text-sm transition-colors flex items-center justify-center gap-1 shadow-lg shadow-blue-600/10 cursor-pointer"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14" />
              <path d="M12 5v14" />
            </svg>
            create
          </button>
        </form>
      </div>
    </aside>
  );
}
