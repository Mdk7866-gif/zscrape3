"use client";

import { ReactNode } from "react";
import { useModal } from "@/lib/useModal";

// Simple alert/info popup (non-blocking, replaces window.alert)
interface AlertMessagePopUpProps {
  title: string;
  message: string | ReactNode;
  type?: "info" | "success" | "warning" | "error";
  onClose: () => void;
}

const ICONS = {
  info: (
    <>
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
    </>
  ),
  success: (
    <>
      <circle cx="12" cy="12" r="10" /><polyline points="9 12 11 14 15 10" />
    </>
  ),
  warning: (
    <>
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </>
  ),
  error: (
    <>
      <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
    </>
  ),
};

const TONES = {
  info: "bg-accent-soft text-accent",
  success: "bg-ok-soft text-ok",
  warning: "bg-warn-soft text-warn",
  error: "bg-danger-soft text-danger",
};

export default function AlertMessagePopUp({
  title,
  message,
  type = "info",
  onClose,
}: AlertMessagePopUpProps) {
  const ref = useModal<HTMLDivElement>(onClose);

  return (
    <div
      className="fixed inset-0 z-100 flex animate-fade-in items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="alert-title"
        className="w-full max-w-md animate-pop-in overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${TONES[type]}`}>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                {ICONS[type]}
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <h3 id="alert-title" className="mb-2 text-base font-bold">
                {title}
              </h3>
              <div className="space-y-1 text-sm leading-relaxed text-muted">{message}</div>
            </div>
          </div>
        </div>
        <div className="flex justify-end border-t border-line bg-surface-2/60 px-6 py-4">
          <button
            onClick={onClose}
            autoFocus
            className="rounded-lg bg-gradient-to-r from-accent to-accent-2 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition-all hover:shadow-xl sm:py-2"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
