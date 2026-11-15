"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, LoaderCircle, VideoOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/copy/provider";
import { vimeoApi, youtubeApi, type ExternalPlayer } from "@/lib/video-player-api";

type Video = { provider: "youtube" | "vimeo"; id: string };

/** SDK-owned iframe children stay separate from React-owned recovery controls. */
export function VideoPlayer({ video, title }: { video: Video; title: string }) {
  const { t } = useCopy();
  const host = useRef<HTMLDivElement>(null);
  const currentTitle = useRef(title);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [failure, setFailure] = useState<string | null>(null);
  const watchUrl = video.provider === "youtube" ? `https://www.youtube.com/watch?v=${video.id}` : `https://vimeo.com/${video.id}`;

  useEffect(() => {
    currentTitle.current = title;
    const frame = host.current?.querySelector("iframe");
    if (frame) frame.title = title;
  }, [title]);

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let disposed = false;
    let failed = false;
    let started = false;
    let ready = false;
    let player: ExternalPlayer | undefined;
    let timer: number | undefined;
    const frame = document.createElement("iframe");
    frame.title = currentTitle.current;
    frame.className = "absolute inset-0 h-full w-full";
    frame.loading = "lazy";
    frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen";
    frame.allowFullscreen = true;
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    frame.src = video.provider === "youtube"
      ? `https://www.youtube-nocookie.com/embed/${video.id}?enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`
      : `https://player.vimeo.com/video/${video.id}?dnt=1`;

    function destroy() {
      try { void Promise.resolve(player?.destroy()).catch(() => undefined); } catch { /* An unavailable provider may already have removed its iframe. */ }
      frame.remove();
    }
    function fail(reason: string) {
      if (disposed || failed) return;
      failed = true;
      window.clearTimeout(timer);
      destroy();
      setFailure(reason);
      setStatus("error");
    }
    function loaded() {
      if (disposed || failed) return;
      ready = true;
      window.clearTimeout(timer);
      setStatus("ready");
    }
    function policy(event: SecurityPolicyViolationEvent) {
      // A single visible player can be identified unambiguously. With multiple
      // preview frames, each player's own SDK/timeout identifies its failure.
      if (!ready && event.effectiveDirective === "frame-src" && document.querySelectorAll("iframe").length === 1) fail("csp");
    }
    async function start() {
      if (started || disposed || failed) return;
      started = true;
      timer = window.setTimeout(() => fail("timeout"), 15_000);
      try {
        if (video.provider === "youtube") {
          const api = await youtubeApi();
          if (disposed || failed) return;
          player = new api.Player(frame, { events: { onReady: loaded, onError: (event) => fail(`youtube-${event.data}`) } });
        } else {
          const api = await vimeoApi();
          if (disposed || failed) return;
          const instance = new api.Player(frame);
          player = instance;
          instance.on("error", () => fail("vimeo"));
          void instance.ready().then(loaded).catch(() => fail("vimeo"));
        }
      } catch { fail("sdk"); }
    }
    frame.addEventListener("error", () => fail("network"));
    document.addEventListener("securitypolicyviolation", policy);
    container.append(frame);
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { observer.disconnect(); void start(); }
    });
    observer.observe(container);
    return () => {
      disposed = true;
      observer.disconnect();
      window.clearTimeout(timer);
      document.removeEventListener("securitypolicyviolation", policy);
      destroy();
    };
  }, [video.provider, video.id, attempt]);

  return <section data-testid="lesson-video" data-video-state={status} data-video-failure={failure ?? undefined} className="my-6 overflow-hidden rounded-[8px] border border-border">
    <div className="relative aspect-video min-h-56 bg-surface-alt">
      <div ref={host} className="absolute inset-0" />
      {status === "loading" && <div className="absolute inset-0 flex items-center justify-center gap-3 p-5 text-base text-text" role="status"><LoaderCircle size={20} className="motion-safe:animate-spin" aria-hidden="true" />{t.learning.videoLoading}</div>}
      {status === "error" && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-5 text-center text-text" role="alert"><VideoOff size={20} aria-hidden="true" /><h3 className="font-heading text-xl">{t.learning.videoFailed}</h3><p className="max-w-lg text-base">{t.learning.videoRecovery}</p></div>}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background px-4 py-3">
      <a href={watchUrl} target="_blank" rel="noopener" className="inline-flex min-h-10 items-center gap-2 text-base font-semibold text-primary underline underline-offset-4"><ExternalLink size={16} aria-hidden="true" />{video.provider === "youtube" ? t.learning.openYouTube : t.learning.openVimeo}</a>
      <Button loading={status === "loading"} loadingLabel={t.learning.videoLoading} title={status === "loading" ? t.learning.videoLoading : undefined} onClick={() => { setFailure(null); setStatus("loading"); setAttempt((value) => value + 1); }} variant="secondary" size="sm">{t.common.retry}</Button>
      {status === "ready" && <p role="status" className="w-full text-sm text-text">{t.learning.videoReady}</p>}
    </div>
  </section>;
}
