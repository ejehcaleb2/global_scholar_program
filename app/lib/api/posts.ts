import { apiFetch } from "@/lib/api/client";


export type HomepagePost = {
  id: string;
  title: string;
  thumbnail_url: string | null;
  summary: string | null;
  body_html: string;
  status: "draft" | "published";
  pinned: boolean;
  pin_order: number | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};


export type PublicHomepagePost = Pick<HomepagePost, "id" | "title" | "summary" | "thumbnail_url" | "body_html" | "published_at">;


export async function getHomepagePosts(): Promise<HomepagePost[]> {
  return apiFetch<HomepagePost[]>("/homepage-posts");
}


export async function getHomepagePost(postId: string): Promise<PublicHomepagePost> {
  return apiFetch<PublicHomepagePost>(`/homepage-posts/${postId}`);
}


export async function getAdminHomepagePosts(status?: "published" | "draft"): Promise<HomepagePost[]> {
  const query = status ? `?status=${status}` : "";
  return apiFetch<HomepagePost[]>(`/admin/homepage-posts${query}`);
}


export async function getAdminHomepagePost(postId: string): Promise<HomepagePost> {
  return apiFetch<HomepagePost>(`/admin/homepage-posts/${postId}`);
}


export async function createAdminHomepagePost(payload: Pick<HomepagePost, "title" | "summary" | "body_html" | "thumbnail_url" | "status" | "pinned">): Promise<HomepagePost> {
  return apiFetch<HomepagePost>("/admin/homepage-posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}


export async function updateAdminHomepagePost(postId: string, payload: { expected_updated_at?: string } & Partial<Pick<HomepagePost, "title" | "summary" | "body_html" | "thumbnail_url" | "status" | "pinned" | "pin_order">>): Promise<HomepagePost> {
  return apiFetch<HomepagePost>(`/admin/homepage-posts/${postId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}


export async function deleteAdminHomepagePost(postId: string): Promise<void> {
  return apiFetch<void>(`/admin/homepage-posts/${postId}`, { method: "DELETE" });
}


export async function reorderAdminHomepagePosts(orderedIds: string[]): Promise<HomepagePost[]> {
  return apiFetch<HomepagePost[]>("/admin/homepage-posts/reorder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ordered_ids: orderedIds }),
  });
}
