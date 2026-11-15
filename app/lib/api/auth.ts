import { ApiError, apiFetch } from "@/lib/api/client";


export function isDuplicateEmailError(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 409) return false;
  try {
    const response = JSON.parse(error.message) as { detail?: unknown };
    return response.detail === "An account with this email already exists";
  } catch {
    return false;
  }
}


type AuthUser = {
  id: string;
  email: string;
  role: "student" | "admin";
  is_active: boolean;
};


export type AuthResponse = {
  user: AuthUser;
  tokens: {
    access_token: string;
    refresh_token: string;
    token_type: string;
  };
};


export async function signup(payload: {
  email: string;
  password: string;
  full_name: string;
  phone: string;
  date_of_birth: string;
  country: string;
  accept_terms: boolean;
  accept_privacy: boolean;
}): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}


export async function login(payload: { email: string; password: string }): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
