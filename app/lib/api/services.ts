import { apiFetch, API_BASE_URL, ApiError } from "@/lib/api/client";


export type AdminServiceRequest = ServiceRequest & {
  user_id: string;
  student: { id: string; full_name: string | null; email: string };
};

export type AdminRequestDetail = AdminServiceRequest & {
  has_document: boolean;
  events: Array<{ from_status: ServiceRequest["status"] | null; to_status: ServiceRequest["status"]; changed_at: string; actor: { id: string; full_name: string | null; email: string } }>;
};

export function getAdminRequestDetail(id: string) {
  return apiFetch<AdminRequestDetail>(`/admin/service-requests/${id}`);
}


export type ServiceRequest = {
  id: string;
  service_type: "essay_review" | "activities_review";
  status: "submitted" | "in_progress" | "returned";
  created_at: string;
};


export async function getAdminServiceRequests(limit = 20, offset = 0, status?: ServiceRequest["status"]): Promise<AdminServiceRequest[]> {
  const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (status) query.set("status", status);
  return apiFetch<AdminServiceRequest[]>(`/admin/service-requests?${query.toString()}`);
}


export async function updateAdminServiceRequestStatus(requestId: string, status: ServiceRequest["status"]): Promise<AdminServiceRequest> {
  return apiFetch<AdminServiceRequest>(`/admin/service-requests/${requestId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}


export async function downloadAdminServiceRequestDocument(requestId: string): Promise<{ blob: Blob; filename: string }> {
  return downloadServiceRequestDocument(requestId);
}


export async function getServiceRequests(): Promise<ServiceRequest[]> {
  return apiFetch<ServiceRequest[]>("/service-requests");
}


export async function createServiceRequest(serviceType: ServiceRequest["service_type"], file: File): Promise<ServiceRequest> {
  const body = new FormData();
  body.append("service_type", serviceType);
  body.append("file", file);
  return apiFetch<ServiceRequest>("/service-requests", { method: "POST", body });
}


export async function downloadServiceRequestDocument(requestId: string): Promise<{ blob: Blob; filename: string }> {
  const token = typeof window === "undefined" ? null : sessionStorage.getItem("gsp_access_token");
  const headers = new Headers({ Accept: "application/octet-stream" });
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_BASE_URL}/service-requests/${requestId}/document`, { headers });
  if (!response.ok) throw new ApiError(response.status, await response.text());
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filename = /^attachment; filename="((?:essay_review|activities_review)-[0-9a-f]{8}\.(?:pdf|doc|docx|jpg|png|webp))"$/.exec(disposition)?.[1];
  if (!filename) throw new ApiError(500, "Invalid attachment response");
  return { blob: await response.blob(), filename };
}
