"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import type { AuthUser } from "./types";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
});

/**
 * AuthProvider: fetch /api/auth/me to hydrate client-side session.
 * Wrap around client subtrees that need useAuth().
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setUser(data ?? null))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * useAuth: get current user in Client Components.
 * Must be used inside AuthProvider.
 */
export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
