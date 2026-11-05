// Real Google sign-in for hosts (FR-12). The OAuth round-trip happens on the
// server (worker/auth.ts): login() navigates to /api/auth/google/start, Google
// redirects back to /api/auth/google/callback, and the server sets an HttpOnly
// session cookie. The browser never sees a token — it only asks /api/auth/me
// who is signed in.
import { useCallback, useEffect, useState } from "react";

export interface AuthUser {
  name: string;
  email: string;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((data: { user: AuthUser | null }) => {
        if (!cancelled) setUser(data.user);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(() => {
    setIsAuthenticating(true);
    const returnTo = window.location.pathname + window.location.hash;
    window.location.href = `/api/auth/google/start?return=${encodeURIComponent(returnTo)}`;
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    } catch {}
    setUser(null);
  }, []);

  return { user, isReady, isAuthenticating, login, logout };
}
