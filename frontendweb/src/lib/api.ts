/**
 * Shared backend fetch helper.
 *
 * Every call goes through `apiFetch` so the admin session token is attached
 * automatically. The token's presence is what selects the workspace: the
 * backend returns admin folders when it's a valid session and public folders
 * otherwise, so "exit admin" is simply clearing the token.
 *
 * The token lives in sessionStorage — it dies with the tab, and the admin
 * password itself is never stored client-side, only exchanged for a token.
 */

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const TOKEN_KEY = "zscrape_admin_token";

export function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(TOKEN_KEY);
}

export function setAdminToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) window.sessionStorage.setItem(TOKEN_KEY, token);
  else window.sessionStorage.removeItem(TOKEN_KEY);
}

/** fetch() against the backend, with the admin token attached when present. */
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getAdminToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("X-Admin-Token", token);
  return fetch(`${API_BASE}${path}`, { ...init, headers });
}

/** Absolute URL for cases that can't go through fetch (e.g. <a download>). */
export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}
