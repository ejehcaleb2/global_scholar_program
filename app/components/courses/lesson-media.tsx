"use client";

import type { CourseLesson } from "@/lib/api/index";
import { useCopy } from "@/lib/copy/provider";
import { VideoPlayer } from "@/components/courses/video-player";

/** Shared by the learner page and saved admin preview. Never embed an arbitrary URL. */
export function LessonMedia({ lesson }: { lesson: Pick<CourseLesson, "title" | "video" | "resources"> }) {
  const { t } = useCopy();
  const video = lesson.video;
  const supported = video?.provider === "youtube" && /^[A-Za-z0-9_-]{11}$/.test(video.id)
    || video?.provider === "vimeo" && /^\d{1,64}$/.test(video.id);
  const resources = (lesson.resources ?? []).filter((resource) => {
    try { return ["http:", "https:"].includes(new URL(resource.url).protocol); } catch { return false; }
  });
  return <>
    {supported && video && <VideoPlayer key={`${video.provider}/${video.id}`} video={video} title={lesson.title} />}
    {video && !supported && <section role="alert" className="my-6 rounded-[8px] border border-border bg-surface-alt p-5 text-text"><h3 className="font-heading text-xl">{t.learning.videoFailed}</h3><p className="mt-2 text-base">{t.learning.videoInvalid}</p></section>}
    {resources.length > 0 && <section className="my-6 border-y border-border py-4"><h3 className="text-base font-semibold text-text">{t.admin.lessonResources}</h3><ul className="mt-2 space-y-2">{resources.map((resource, index) => <li key={index}><a href={resource.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center break-all text-base text-primary underline">{resource.title}</a></li>)}</ul></section>}
  </>;
}
