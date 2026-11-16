import { apiFetch } from "@/lib/api/client";


export type PostSection =
  | { id: string; type: "text"; body_html: string }
  | { id: string; type: "image"; url: string; alt: string; caption: string }
  | { id: string; type: "video"; url: string; caption: string };

export type HomepagePost = {
  sections: PostSection[];
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


export type PublicHomepagePost = Pick<HomepagePost, "id" | "title" | "summary" | "thumbnail_url" | "body_html" | "sections" | "published_at">;


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


export async function createAdminHomepagePost(payload: Pick<HomepagePost, "title" | "summary" | "body_html" | "thumbnail_url" | "status" | "pinned" | "sections">): Promise<HomepagePost> {
  return apiFetch<HomepagePost>("/admin/homepage-posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}


export async function updateAdminHomepagePost(postId: string, payload: { expected_updated_at?: string } & Partial<Pick<HomepagePost, "title" | "summary" | "body_html" | "thumbnail_url" | "status" | "pinned" | "pin_order" | "sections">>): Promise<HomepagePost> {
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
