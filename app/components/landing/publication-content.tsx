"use client";
import type { PostSection } from "@/lib/api/posts";
import { RichContent } from "@/components/ui/rich-content";
import { MediaImage } from "@/components/ui/media-image";
import { VideoPlayer } from "@/components/courses/video-player";
import { parseLessonVideo } from "@/lib/utils/video";
import { useCopy } from "@/lib/copy/provider";

/** One reading layout for the saved article and the editor's unsaved preview. */
export function PublicationContent({ body, sections, title }: { body: string; sections: PostSection[]; title: string }) {
  const { t } = useCopy();
  return <div className="space-y-8 pt-8">
    {body && <RichContent html={body} />}
    {sections.map(s => {
      if (s.type === "text") return <RichContent key={s.id} html={s.body_html} />;
      if (s.type === "image") return <figure key={s.id} className="space-y-3"><MediaImage src={s.url} alt={s.alt} width={1200} height={800} sizes="(max-width: 896px) 100vw, 832px" className="h-auto w-full object-contain" wrapperClassName="block overflow-hidden rounded-[8px] border border-border" />{s.caption && <figcaption className="break-words text-base leading-7 text-text">{s.caption}</figcaption>}</figure>;
      const video = parseLessonVideo(s.url);
      return video ? <figure key={s.id} className="space-y-3"><VideoPlayer video={video} title={s.caption || title || t.posts.videoTitle} />{s.caption && <figcaption className="break-words text-base leading-7 text-text">{s.caption}</figcaption>}</figure> : null;
    })}
  </div>;
}
