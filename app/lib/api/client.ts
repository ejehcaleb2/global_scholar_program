import { copy } from "@/lib/copy/dictionary";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";


export class ApiError extends Error {
  constructor(public status: number, message: string, public retryAfter?: number) {
    super(message);
    this.name = "ApiError";
  }
}


export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = typeof window === "undefined" ? null : sessionStorage.getItem("gsp_access_token");
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  const errorBody = response.ok ? "" : await response.text();
  const operationPasswordFailure = (path === "/profile/password" || path === "/profile/email") && errorBody.includes('"Invalid current password"');
  // A request made before token replacement must not log out the fresh session.
  if (response.status === 401 && !operationPasswordFailure && typeof window !== "undefined" && token === sessionStorage.getItem("gsp_access_token")) {
    sessionStorage.removeItem("gsp_access_token");
    sessionStorage.removeItem("gsp_refresh_token");
    window.dispatchEvent(new Event("gsp-auth-expired"));
  }
  if (!response.ok) throw new ApiError(response.status, errorBody, Number(response.headers.get("Retry-After")) || undefined);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}


export function getApiErrorMessage(error: unknown, fallback: string): string {
  const messages = copy.apiErrors;
  if (error instanceof TypeError) return messages.unavailable;
  if (!(error instanceof ApiError)) return fallback;
  if (error.status === 401) return messages.unauthorized;
  if (error.status === 403) return messages.forbidden;
  if (error.status === 404) return messages.notFound;
  if (error.status === 409) return error.message.includes("confirmation_required") ? messages.confirmationRequired : messages.conflict;
  if (error.status === 400) return messages.invalidAction;
  if (error.status === 413) return messages.fileTooLarge;
  if (error.status === 415) return messages.fileType;
  if (error.status === 422) return messages.validation;
  if (error.status === 429) return messages.rateLimit;
  if (error.status >= 500) return messages.server;
  return fallback;
}
