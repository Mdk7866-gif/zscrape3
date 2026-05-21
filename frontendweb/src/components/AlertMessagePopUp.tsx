"use client";

// Simple alert/info popup (non-blocking, replaces window.alert)
interface AlertMessagePopUpProps {
  title: string;
  message: string;
  type?: "info" | "success" | "warning" | "error";
  onClose: () => void;
}

const icons = {
  info: (
    <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  ),
  success: (
    <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/>
    </svg>
  ),
  warning: (
    <svg className="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
  error: (
    <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
    </svg>
  ),
};

const colors = {
  info: "border-blue-200 bg-blue-50",
  success: "border-green-200 bg-green-50",
  warning: "border-amber-200 bg-amber-50",
  error: "border-red-200 bg-red-50",
};

export default function AlertMessagePopUp({ title, message, type = "info", onClose }: AlertMessagePopUpProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className={`bg-white rounded-2xl shadow-2xl w-full max-w-sm border ${colors[type]} overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="shrink-0 mt-0.5">{icons[type]}</div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-zinc-900 text-base mb-1">{title}</h3>
              <p className="text-sm text-zinc-600 leading-relaxed">{message}</p>
            </div>
          </div>
        </div>
        <div className="px-6 pb-5 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-zinc-900 hover:bg-zinc-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
