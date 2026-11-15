import { apiFetch, API_BASE_URL, ApiError } from "@/lib/api/client";
import type { AuthResponse } from "@/lib/api/auth";


export type Profile = {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  date_of_birth: string | null;
  country: string | null;
  avatar_url: string | null;
  updated_at: string;
  education_level: "high_school" | "undergraduate" | "graduate" | "other" | null;
  school: string | null;
  city: string | null;
  what_brings_you: string[] | null;
  fields_of_study: string[] | null;
  countries_of_interest: string[] | null;
};


export async function getProfile(): Promise<Profile> {
  return apiFetch<Profile>("/profile");
}


const PROFILE_PATCH_FIELDS = [
  "full_name",
  "phone",
  "date_of_birth",
  "country",
  "education_level",
  "school",
  "city",
  "what_brings_you",
  "fields_of_study",
  "countries_of_interest",
] as const;


export type ProfilePatchInput = Partial<Pick<
  Profile,
  | "full_name"
  | "phone"
  | "date_of_birth"
  | "country"
  | "education_level"
  | "school"
  | "city"
  | "what_brings_you"
  | "fields_of_study"
  | "countries_of_interest"
>>;


function sanitizeProfilePatch(payload: Record<string, unknown>): ProfilePatchInput {
  const safePayload: Record<string, unknown> = {};

  for (const key of PROFILE_PATCH_FIELDS) {
    const value = payload[key];
    if (value !== undefined) {
      safePayload[key] = value;
    }
  }

  return safePayload as ProfilePatchInput;
}


export async function updateProfile(payload: Record<string, unknown>): Promise<Profile> {
  const safePayload = sanitizeProfilePatch(payload);
  return apiFetch<Profile>("/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(safePayload),
  });
}


export async function uploadProfileAvatar(file: File): Promise<{ avatar_url: string | null; updated_at: string }> {
  const body = new FormData();
  body.append("file", file);
  return apiFetch<{ avatar_url: string | null; updated_at: string }>("/profile/avatar", { method: "POST", body });
}


export async function getProfileAvatar(userId: string, updatedAt?: string | null, size: 96 | 512 = 512): Promise<Blob> {
  const token = typeof window === "undefined" ? null : sessionStorage.getItem("gsp_access_token");
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_BASE_URL}/profile/avatar/${encodeURIComponent(userId)}?size=${size}&v=${encodeURIComponent(updatedAt ?? "")}`, { headers });
  if (!response.ok) throw new ApiError(response.status, await response.text());
  return response.blob();
}


export async function updateProfileEmail(payload: { current_password: string; new_email: string }): Promise<Profile> {
  return apiFetch<Profile>("/profile/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}


export async function updateProfilePassword(payload: { current_password: string; new_password: string }): Promise<{ status: string; tokens: AuthResponse["tokens"] }> {
  return apiFetch<{ status: string; tokens: AuthResponse["tokens"] }>("/profile/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
