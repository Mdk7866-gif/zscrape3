"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { apiFetch, getAdminToken, setAdminToken } from "@/lib/api";

interface AdminContextType {
  /** True while an admin session is active — the app is showing the private workspace. */
  isAdmin: boolean;
  /** True until the stored token has been re-validated against the backend on load. */
  checking: boolean;
  /** Returns an error message on failure, or null on success. */
  login: (password: string) => Promise<string | null>;
  logout: () => Promise<void>;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used within AdminProvider");
  return ctx;
}

export function AdminProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);

  // A stored token may have expired or been dropped by a backend restart
  // (sessions are in-memory). Confirm with the server before trusting it,
  // otherwise the UI would claim admin mode while every request 404s.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!getAdminToken()) {
        setChecking(false);
        return;
      }
      try {
        const res = await apiFetch("/admin/session");
        const data = await res.json().catch(() => ({ admin: false }));
        if (cancelled) return;
        if (data.admin) {
          setIsAdmin(true);
        } else {
          setAdminToken(null);
          setIsAdmin(false);
        }
      } catch {
        // Backend unreachable — don't claim admin mode we can't verify.
        if (!cancelled) {
          setAdminToken(null);
          setIsAdmin(false);
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (password: string): Promise<string | null> => {
    try {
      const res = await apiFetch("/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return data.detail || "Incorrect password";
      }
      const data = await res.json();
      if (!data.token) return "Login failed — no session returned";
      setAdminToken(data.token);
      setIsAdmin(true);
      return null;
    } catch {
      return "Could not reach the server";
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch("/admin/logout", { method: "POST" });
    } catch {
      // Even if the server call fails, drop the token locally.
    }
    setAdminToken(null);
    setIsAdmin(false);
  }, []);

  return (
    <AdminContext.Provider value={{ isAdmin, checking, login, logout }}>
      {children}
    </AdminContext.Provider>
  );
}
