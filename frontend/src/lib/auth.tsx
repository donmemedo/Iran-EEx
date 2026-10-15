"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { mutate } from "swr";

import { ApiError, apiFetch, getToken, setToken, UNAUTHORIZED_EVENT, type User } from "./api";

interface AuthContextValue {
  user: User | null;
  status: "loading" | "authenticated" | "anonymous";
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Forget everything the previous session fetched: the SWR cache and the
 * service worker's API caches (names ending in "-data", see public/sw.js).
 * Those caches are keyed by URL only, so they must not outlive a session.
 */
export async function clearClientData() {
  await mutate(() => true, undefined, { revalidate: false });
  if (typeof window === "undefined" || !("caches" in window)) return;
  try {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.endsWith("-data")).map((name) => caches.delete(name)));
  } catch {
    /* Cache Storage can be unavailable (private window, insecure origin) */
  }
}

export function AuthProvider({ children, locale }: { children: ReactNode; locale: string }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthContextValue["status"]>("loading");
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    if (!getToken()) {
      setStatus("anonymous");
      return;
    }
    apiFetch<User>("/api/v1/auth/me")
      .then((me) => {
        if (cancelled) return;
        setUser(me);
        setStatus("authenticated");
      })
      .catch(() => {
        // A 401 already cleared the token in apiFetch. Any other failure
        // (offline, server down) keeps it, so the next load can try again.
        if (cancelled) return;
        setStatus("anonymous");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const endSession = useCallback(() => {
    setToken(null);
    void clearClientData();
    setUser(null);
    setStatus("anonymous");
  }, []);

  // Session expired: apiFetch saw a 401 on a request that carried a token.
  useEffect(() => {
    function onUnauthorized() {
      endSession();
      // Only the app area needs a session. Public pages (and the login page
      // itself, which would loop) stay where they are.
      if (window.location.pathname.startsWith(`/${locale}/app`)) router.replace(`/${locale}/login`);
    }
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [endSession, router, locale]);

  const login = useCallback(async (email: string, password: string) => {
    // Start clean: no stale Authorization header on the login request, and
    // nothing cached by a previous user survives into this session.
    setToken(null);
    await clearClientData();
    const { access_token } = await apiFetch<{ access_token: string }>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setToken(access_token);
    const me = await apiFetch<User>("/api/v1/auth/me");
    setUser(me);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(() => {
    endSession();
    router.push(`/${locale}/login`);
  }, [endSession, router, locale]);

  return (
    <AuthContext.Provider value={{ user, status, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside an AuthProvider");
  return ctx;
}

export { ApiError };
