"use client";

import { useAuth } from "@/components/auth/auth-provider";


// Course, resource and masterclass payloads differ by viewer (locked flags, progress), so scope them by user id.
export function useScope() {
  const { currentUser, accessToken } = useAuth();
  return { scope: currentUser?.id ?? (accessToken ? "user" : "guest"), signedIn: Boolean(accessToken) };
}
