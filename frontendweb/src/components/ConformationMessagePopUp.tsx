"use client";

import { useModal } from "@/lib/useModal";

// Confirmation popup — replaces window.confirm()
interface ConformationMessagePopUpProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConformationMessagePopUp({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}: ConformationMessagePopUpProps) {
  const ref = useModal<HTMLDivElement>(onCancel);

  return (
    <div
      className="fixed inset-0 z-100 flex animate-fade-in items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="w-full max-w-sm animate-pop-in overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
                danger ? "bg-danger-soft text-danger" : "bg-accent-soft text-accent"
              }`}
            >
              {danger ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 id="confirm-title" className="mb-1 text-base font-bold">
                {title}
              </h3>
              <p className="text-sm leading-relaxed text-muted">{message}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-line bg-surface-2/60 px-6 py-4 sm:flex-row sm:justify-end sm:gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface-3 hover:text-fg sm:py-2"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            autoFocus
            className={`rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition-all hover:shadow-xl sm:py-2 ${
              danger
                ? "bg-danger shadow-danger/25 hover:brightness-110"
                : "bg-gradient-to-r from-accent to-accent-2 shadow-accent/25"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
