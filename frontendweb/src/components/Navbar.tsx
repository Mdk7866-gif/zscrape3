"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import AdminAskPasswordPopUp from "@/components/AdminAskPasswordPopUp";
import ConformationMessagePopUp from "@/components/ConformationMessagePopUp";
import { useAdmin } from "@/components/AdminContext";

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showAdminPrompt, setShowAdminPrompt] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const { isAdmin, logout } = useAdmin();
  const router = useRouter();

  // Switching workspaces changes which folders exist, so any open folder page
  // is stale — send the user home on both entry and exit.
  const leaveToHome = () => router.push("/");

  return (
    <>
      <nav className="flex items-center justify-between px-4 sm:px-6 py-3 bg-white border-b border-zinc-200 text-zinc-900 shadow-sm sticky top-0 z-30">
        <div className="flex items-center gap-3">
          {/* Hamburger for mobile */}
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-1.5 rounded-md text-zinc-500 hover:bg-zinc-100 transition-colors"
            aria-label="Open menu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <Link href="/" className="flex items-center gap-2.5">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-white text-sm shadow-lg ${
              isAdmin ? "bg-zinc-900 shadow-zinc-900/30" : "bg-blue-600 shadow-blue-500/30"
            }`}>
              Z
            </div>
            <span className="text-lg font-bold tracking-tight text-zinc-900">zscrape</span>
          </Link>
          {isAdmin && (
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-white bg-zinc-900 px-2.5 py-1 rounded-full">
              <span className="text-[10px]">🔒</span>
              ADMIN
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isAdmin ? (
            <button
              onClick={() => setShowExitConfirm(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-zinc-700 bg-white border border-zinc-300 hover:border-zinc-400 hover:bg-zinc-50 px-3 py-1.5 rounded-lg transition-colors"
              title="Leave the admin workspace"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Exit Admin
            </button>
          ) : (
            <button
              onClick={() => setShowAdminPrompt(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-zinc-700 bg-white border border-zinc-300 hover:border-zinc-900 hover:text-zinc-900 px-3 py-1.5 rounded-lg transition-colors"
              title="Open the private admin workspace"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Admin
            </button>
          )}
          <span className="text-xs text-zinc-500 bg-zinc-100 border border-zinc-200 px-2.5 py-1 rounded-full font-mono hidden sm:block">
            v3.0.0
          </span>
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
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          {/* Drawer */}
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-zinc-50 shadow-2xl flex flex-col">
            <Sidebar onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
