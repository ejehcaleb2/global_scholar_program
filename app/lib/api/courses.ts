import { apiFetch } from "@/lib/api/client";


export type CourseSummary = {
  id: string;
  title: string;
  summary: string | null;
  description: string | null;
  thumbnail_url: string | null;
  access_type: "free" | "members_only";
  locked: boolean;
  module_count: number;
  lesson_count: number;
  duration_minutes: number;
  progress: CourseProgress | null;
};


export type CourseProgress = {
  completed_count: number;
  total_count: number;
  percent: number;
};


export type CourseLesson = {
  id: string;
  title: string;
  body_html: string;
  try_it_yourself_prompt: string | null;
  duration_minutes: number;
  video: { provider: "youtube" | "vimeo"; id: string } | null;
  resources: CourseLessonResource[];
  order: number;
  updated_at?: string | null;
  completed: boolean;
};


export type CourseLessonResource = { title: string; url: string };


export type CourseModule = {
  id: string;
  title: string;
  order: number;
  updated_at?: string | null;
  lessons: CourseLesson[];
};


export type CourseDetail = {
  id: string;
  title: string;
  summary?: string | null;
  description: string | null;
  thumbnail_url?: string | null;
  learning_outcomes?: string[];
  access_type: "free" | "members_only";
  status: "draft" | "published";
  structure_revision?: number;
  updated_at?: string | null;
  modules: CourseModule[];
  progress: CourseProgress;
};


export async function getCourses(): Promise<CourseSummary[]> {
  return apiFetch<CourseSummary[]>("/courses");
}


export async function getCourse(courseId: string): Promise<CourseDetail> {
  return apiFetch<CourseDetail>(`/courses/${courseId}`);
}


export async function completeLesson(lessonId: string): Promise<{ lesson_id: string; completed: boolean; progress: CourseProgress }> {
  return apiFetch(`/lessons/${lessonId}/complete`, { method: "POST" });
}


export async function uncompleteLesson(lessonId: string): Promise<{ lesson_id: string; completed: boolean; progress: CourseProgress }> {
  return apiFetch(`/lessons/${lessonId}/complete`, { method: "DELETE" });
}
