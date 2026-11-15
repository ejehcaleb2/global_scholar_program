import type { CourseLesson } from "@/lib/api/courses";

/** Mirror the server's supported HTTPS URL forms; store only provider and ID. */
export function parseLessonVideo(value: string): CourseLesson["video"] {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port && url.port !== "443") return null;
    const host = url.hostname.replace(/^www\.(?=youtube\.com$|vimeo\.com$|youtube-nocookie\.com$)/, "");
    const segments = url.pathname.split("/").filter(Boolean);
    let id: string | null = null;
    if (host === "youtube.com") {
      id = url.pathname === "/watch" ? url.searchParams.get("v") : segments.length === 2 && ["embed", "shorts"].includes(segments[0]) ? segments[1] : null;
    } else if (host === "youtube-nocookie.com" && segments.length === 2 && segments[0] === "embed") {
      id = segments[1];
    } else if (host === "youtu.be" && segments.length === 1) {
      id = segments[0];
    } else if (host === "vimeo.com" && segments.length === 1 && /^\d{1,64}$/.test(segments[0])) {
      return { provider: "vimeo", id: segments[0] };
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? { provider: "youtube", id } : null;
  } catch { return null; }
}
