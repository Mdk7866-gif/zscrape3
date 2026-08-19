"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import AdminAskPasswordPopUp from "@/components/AdminAskPasswordPopUp";
import ConformationMessagePopUp from "@/components/ConformationMessagePopUp";
import ThemeToggle from "@/components/ThemeToggle";
import RegenerateThumbnailsButton from "@/components/RegenerateThumbnailsButton";
import { useAdmin } from "@/components/AdminContext";
import { APP_VERSION } from "@/lib/version";

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showAdminPrompt, setShowAdminPrompt] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const { isAdmin, checking, logout } = useAdmin();
  const router = useRouter();

  // Switching workspaces changes which folders exist, so any open folder page
  // is stale — send the user home on both entry and exit.
  const leaveToHome = () => router.push("/");

  // The drawer is a fixed overlay; leaving the page scrollable behind it lets a
  // touch scroll bleed through to the content underneath.
  useEffect(() => {
    if (!mobileOpen) return;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <>
      <nav className="sticky top-0 z-30 shrink-0 border-b border-line glass">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-5 sm:py-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            {/* Hamburger for mobile */}
            <button
              onClick={() => setMobileOpen(true)}
              className="-ml-1 rounded-lg p-2 text-muted transition-colors hover:bg-surface-2 hover:text-fg lg:hidden"
              aria-label="Open menu"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            <Link href="/" className="group flex min-w-0 items-center gap-2.5">
              <span
                className={`relative grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-xl text-sm font-black text-white shadow-lg transition-transform duration-300 group-hover:scale-105 ${
                  isAdmin
                    ? "bg-gradient-to-br from-fg to-muted shadow-black/25"
                    : "bg-gradient-to-br from-accent via-accent-2 to-accent-3 shadow-accent/30"
                }`}
              >
                Z
                {/* Sheen sweep across the logo tile */}
                <span
                  aria-hidden
                  className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/45 to-transparent transition-transform duration-700 group-hover:translate-x-full"
                />
              </span>
              <span className="truncate text-base font-extrabold tracking-tight sm:text-lg">
                zscrape
              </span>
            </Link>

            {isAdmin && (
              <span className="hidden items-center gap-1.5 rounded-full bg-fg px-2.5 py-1 text-[10px] font-bold tracking-wider text-bg sm:flex">
                <LockIcon className="h-3 w-3" />
                ADMIN
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
            {/* Renders nothing off folder pages, or when no Instagram/Facebook
                thumbnail in the open folder has actually expired. */}
            <RegenerateThumbnailsButton />

            <ThemeToggle />

            {/* Fixed width across all three states (checking / in / out) so the
                navbar doesn't reflow once the admin session is validated. */}
            <div className="w-[38px] sm:w-[112px]">
              {checking ? (
                <div className="skeleton h-[34px] w-full rounded-lg" />
              ) : isAdmin ? (
                <button
                  onClick={() => setShowExitConfirm(true)}
                  className="flex h-[34px] w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-surface text-xs font-semibold text-muted transition-colors hover:border-danger-line hover:bg-danger-soft hover:text-danger"
                  title="Leave the admin workspace"
                  aria-label="Exit admin workspace"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  <span className="hidden sm:inline">Exit Admin</span>
                </button>
              ) : (
                <button
                  onClick={() => setShowAdminPrompt(true)}
                  className="flex h-[34px] w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-surface text-xs font-semibold text-muted transition-colors hover:border-accent-line hover:bg-accent-soft hover:text-accent"
                  title="Open the private admin workspace"
                  aria-label="Open admin workspace"
                >
                  <LockIcon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Admin</span>
                </button>
              )}
            </div>

            <span className="hidden rounded-full border border-line bg-surface-2 px-2.5 py-1 font-mono text-[11px] text-subtle md:block">
              {APP_VERSION}
            </span>
          </div>
        </div>
      </nav>

      {showAdminPrompt && (
        <AdminAskPasswordPopUp
          onClose={() => setShowAdminPrompt(false)}
          onSuccess={leaveToHome}
        />
      )}

      {showExitConfirm && (
        <ConformationMessagePopUp
          title="Exit admin workspace?"
          message="You'll go back to the normal view. Your admin folders and videos stay saved and stay hidden from normal users."
          confirmLabel="Exit Admin"
          cancelLabel="Stay"
          onConfirm={async () => {
            setShowExitConfirm(false);
            await logout();
            leaveToHome();
          }}
          onCancel={() => setShowExitConfirm(false)}
        />
      )}

      {/* Mobile sidebar drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div
            className="absolute inset-0 animate-fade-in bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-[min(19rem,85vw)] animate-slide-in-left flex-col shadow-2xl">
            <Sidebar onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}

function LockIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
