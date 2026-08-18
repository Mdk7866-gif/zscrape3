"use client";

import { useState, useRef, useEffect } from "react";
import { useAdmin } from "@/components/AdminContext";

interface AdminAskPasswordPopUpProps {
  onClose: () => void;
  /** Called after a successful login, so the opener can react (e.g. navigate home). */
  onSuccess?: () => void;
}

export default function AdminAskPasswordPopUp({ onClose, onSuccess }: AdminAskPasswordPopUpProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { login } = useAdmin();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Escape to dismiss — matches the other popups in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || loading) return;
    setLoading(true);
    setError(null);
    const err = await login(password);
    setLoading(false);
    if (err) {
      setError(err);
      setPassword("");
      inputRef.current?.focus();
      return;
    }
    onSuccess?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-zinc-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-100 bg-zinc-50/70 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-zinc-900 flex items-center justify-center text-white text-base shrink-0">
            🔒
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-zinc-900">Admin access</h2>
            <p className="text-xs text-zinc-500">Enter the admin password to continue</p>
          </div>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div className="p-6">
            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              placeholder="Password"
              autoComplete="current-password"
              className="w-full bg-zinc-50 border border-zinc-300 rounded-lg px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 transition-all disabled:opacity-60"
            />

            {error && (
              <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
                {error}
              </div>
            )}

            <p className="mt-3 text-[11px] text-zinc-400 leading-relaxed">
              Admin folders and videos are private — they stay hidden from normal users.
            </p>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-zinc-100 bg-zinc-50/70 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !password.trim()}
              className="px-5 py-2 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 disabled:hover:bg-zinc-900 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Checking…
                </>
              ) : (
                "Unlock"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
