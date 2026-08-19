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

/**
 * Error for "the request never reached the server" — no internet, backend not
 * running, DNS/CORS failure. Distinct from an HTTP error, which means the
 * server answered and the caller should read the status.
 */
export class NetworkError extends Error {
  /** True when the browser itself reports no connectivity. */
  readonly offline: boolean;

  constructor(message: string, offline: boolean) {
    super(message);
    this.name = "NetworkError";
    this.offline = offline;
  }
}

/**
 * Turn fetch()'s opaque "Failed to fetch" TypeError into something actionable.
 *
 * This app needs the internet for everything (yt-dlp, Supabase, OpenAI), so the
 * single most likely cause of a failed request is a dropped connection — but
 * the browser's own message never says so, which leaves the user staring at
 * "Failed to fetch" with no idea whether it's their wifi, the server, or a bug.
 * `navigator.onLine` tells the two apart cheaply.
 */
function describeNetworkFailure(): NetworkError {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  return new NetworkError(
    offline
      ? "You appear to be offline — please check your internet connection and try again."
      : `Couldn't reach the server at ${API_BASE}. Check your internet connection, and make sure the backend is running.`,
    offline,
  );
}

/** fetch() against the backend, with the admin token attached when present. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getAdminToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("X-Admin-Token", token);
  try {
    return await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch (err) {
    // A deliberate abort isn't a connectivity problem — let it through so
    // callers that cancel in-flight requests aren't told their wifi is down.
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw describeNetworkFailure();
  }
}

/**
 * Normalize anything thrown in a catch block into an Error with a useful message.
 *
 * `apiFetch` only guards the initial request; a connection that drops *while* a
 * response body is streaming (the NDJSON bulk-upload and regenerate endpoints
 * can run for minutes) rejects the reader with a bare TypeError instead, which
 * would otherwise reach the user as "Failed to fetch" again.
 */
export function asFriendlyError(err: unknown): Error {
  if (err instanceof NetworkError) return err;
  if (err instanceof DOMException && err.name === "AbortError") return err;
  if (err instanceof TypeError) return describeNetworkFailure();
  return err instanceof Error ? err : new Error(String(err));
}

/** Absolute URL for cases that can't go through fetch (e.g. <a download>). */
export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}
