"use client";

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { queryClient } from "@/lib/queries/client";
import type { AuthResponse } from "@/lib/api/index";

type User = { id: string; email: string; role: "student" | "admin"; is_active: boolean };
type AuthContextValue = {
  accessToken: string | null;
  currentUser: User | null;
  isInitializing: boolean;
  isLoggingOut: boolean;
  finishLogout: () => void;
  login: (token: string, user: User, refreshToken?: string) => void;
  replaceTokens: (tokens: AuthResponse["tokens"]) => void;
  updateEmail: (email: string) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const TOKEN_KEY = "gsp_access_token";
const REFRESH_TOKEN_KEY = "gsp_refresh_token";
const USER_KEY = "gsp_current_user";
export const LOGOUT_REDIRECT_KEY = "gsp_logout_redirect";

function subscribeToAuthStore(callback: () => void) {
  window.addEventListener("gsp-auth-change", callback);
  return () => window.removeEventListener("gsp-auth-change", callback);
}

function readAuthSnapshot() {
  return JSON.stringify([sessionStorage.getItem(TOKEN_KEY), sessionStorage.getItem(USER_KEY), sessionStorage.getItem(LOGOUT_REDIRECT_KEY)]);
}

function notifyAuthStore() {
  window.dispatchEvent(new Event("gsp-auth-change"));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const snapshot = useSyncExternalStore(subscribeToAuthStore, readAuthSnapshot, () => null);
  const [storedToken, storedUser, logoutRedirect] = snapshot ? JSON.parse(snapshot) as [string | null, string | null, string | null] : [null, null, null];
  const accessToken = storedToken;
  const currentUser = storedUser ? JSON.parse(storedUser) as User : null;
  const isInitializing = snapshot === null;
  const isLoggingOut = logoutRedirect === "true";

  useEffect(() => {
    const clear = () => {
      queryClient.clear();
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(REFRESH_TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
      notifyAuthStore();
    };
    window.addEventListener("gsp-auth-expired", clear);
    return () => window.removeEventListener("gsp-auth-expired", clear);
  }, []);

  const value = useMemo(() => ({
    accessToken,
    currentUser,
    isInitializing,
    isLoggingOut,
    finishLogout: () => {
      sessionStorage.removeItem(LOGOUT_REDIRECT_KEY);
      notifyAuthStore();
    },
    login: (token: string, user: User, refreshToken?: string) => {
      if (currentUser?.id !== user.id) queryClient.clear();
      sessionStorage.setItem(TOKEN_KEY, token);
      if (refreshToken) sessionStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
      else sessionStorage.removeItem(REFRESH_TOKEN_KEY);
      sessionStorage.setItem(USER_KEY, JSON.stringify(user));
      sessionStorage.removeItem(LOGOUT_REDIRECT_KEY);
      notifyAuthStore();
    },
    replaceTokens: (tokens: AuthResponse["tokens"]) => {
      sessionStorage.setItem(TOKEN_KEY, tokens.access_token);
      sessionStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
      notifyAuthStore();
    },
    updateEmail: (email: string) => {
      if (!currentUser) return;
      const updatedUser = { ...currentUser, email };
      sessionStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
      notifyAuthStore();
    },
    logout: () => {
      sessionStorage.setItem(LOGOUT_REDIRECT_KEY, "true");
      queryClient.clear();
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(REFRESH_TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
      notifyAuthStore();
    },
  }), [accessToken, currentUser, isInitializing, isLoggingOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
