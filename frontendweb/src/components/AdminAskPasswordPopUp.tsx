"use client";

import { useState, useRef, useEffect } from "react";
import { useAdmin } from "@/components/AdminContext";
import { useModal } from "@/lib/useModal";

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
  // Escape-to-dismiss, scroll lock and focus trap all come from here now —
  // this component used to hand-roll only the first of the three.
  const dialogRef = useModal<HTMLDivElement>(onClose);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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
    <div
      className="fixed inset-0 z-60 flex animate-fade-in items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm animate-pop-in overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-line bg-surface-2/70 px-6 py-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-white">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <div className="min-w-0">
            <h2 id="admin-title" className="text-base font-bold">
              Admin access
            </h2>
            <p className="text-xs text-subtle">Enter the admin password to continue</p>
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
              aria-label="Admin password"
              autoComplete="current-password"
              className="w-full rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 text-sm text-fg placeholder-subtle transition-all focus:border-accent focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-60"
            />

            {/* Fixed slot: the error appearing must not resize the dialog. */}
            <div className="min-h-[2.25rem] pt-3">
              {error && (
                <p
                  role="alert"
                  className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-xs text-danger"
                >
                  {error}
                </p>
              )}
            </div>

            <p className="text-[11px] leading-relaxed text-subtle">
              Admin folders and videos are private — they stay hidden from normal users.
            </p>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-line bg-surface-2/70 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-lg px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-3 hover:text-fg disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !password.trim()}
              className="flex min-w-[104px] items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-accent to-accent-2 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition-all hover:shadow-xl disabled:opacity-50 disabled:shadow-none"
            >
              {loading ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
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
