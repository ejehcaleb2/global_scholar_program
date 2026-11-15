import type { Metadata } from "next";
import { Suspense } from "react";
import { CourseList } from "@/components/admin/courses/course-list";

export const metadata: Metadata = { title: "Courses | Global Scholars Program" };

export default function AdminCoursesPage() {
  return <Suspense fallback={<main className="mx-auto min-h-[60vh] max-w-[1600px] animate-pulse px-5 py-8 sm:px-8 lg:px-10" aria-busy="true"><div className="mb-7 h-20 rounded-[8px] bg-surface-alt" /><div className="h-96 rounded-[8px] bg-surface-alt" /></main>}><CourseList /></Suspense>;
}
