import { AdminPostForm } from "@/components/admin/posts/post-form";

export default async function EditHomepagePostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminPostForm postId={id} />;
}