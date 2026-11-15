"use client";

import { useParams } from "next/navigation";
import { CourseHubShell } from "@/components/admin/courses/course-hub";

export default function CourseLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ courseId: string }>();
  return <CourseHubShell courseId={params.courseId}>{children}</CourseHubShell>;
}