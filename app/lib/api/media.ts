import { apiFetch } from "@/lib/api/client";


export async function uploadAdminMedia(file: File): Promise<{ url: string }> {
  const body = new FormData();
  body.append("file", file);
  return apiFetch<{ url: string }>("/admin/media", { method: "POST", body });
}
