import { redirect } from "next/navigation";

type CourseLessonsPageProps = {
  params: Promise<{ courseId: string }>;
};

export default async function CourseLessonsPage({ params }: CourseLessonsPageProps) {
  const { courseId } = await params;
  redirect(`/admin/courses/${courseId}/curriculum`);
}