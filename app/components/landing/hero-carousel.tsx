"use client";

import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { LandingImage, getLandingMedia } from "@/components/landing/landing-image";
import { useCopy } from "@/lib/copy/provider";

const AUTOPLAY_MS = 6000;

function useAutoplayAllowed() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return !reduced;
}

export function HeroCarousel({ autoplay = true }: { autoplay?: boolean }) {
  const { t } = useCopy();
  const motionAllowed = useAutoplayAllowed();
  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [playRequested, setPlayRequested] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const slides = useMemo(() => [
    { id: "program-banner", asset: getLandingMedia("program-banner"), alt: t.landing.heroBannerAlt },
    { id: "classroom-session", asset: getLandingMedia("classroom-session"), alt: t.landing.heroClassroomAlt },
    { id: "students-with-booklet", asset: getLandingMedia("students-with-booklet"), alt: t.landing.heroBookletAlt },
  ], [t.landing.heroBannerAlt, t.landing.heroBookletAlt, t.landing.heroClassroomAlt]);

  const count = slides.length;
  const current = index % count;
  const automatic = count > 1 && !userPaused && ((autoplay && motionAllowed) || playRequested);
  const playing = automatic && !hovered && !focused && !tabHidden;

  useEffect(() => {
    const onVisibility = () => setTabHidden(document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => setIndex((value) => (value + 1) % count), AUTOPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [playing, current, count]);

  const go = useCallback((target: number) => setIndex(((target % count) + count) % count), [count]);

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label={t.landing.heroCarouselLabel}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
      onKeyDown={(event) => {
        if (count < 2) return;
        if (event.key === "ArrowLeft") { event.preventDefault(); go(current - 1); }
        if (event.key === "ArrowRight") { event.preventDefault(); go(current + 1); }
      }}
    >
      <div className="relative aspect-[3/2] w-full overflow-hidden rounded-[8px] bg-surface-alt p-2" aria-live={playing ? "off" : "polite"}>
        {slides.map((slide, position) => {
          const visible = position === current;
          return (
            <div
              key={slide.id}
              role="group"
              aria-roledescription="slide"
              aria-label={t.landing.heroSlideOf.replace("{n}", String(position + 1)).replace("{total}", String(count))}
              aria-hidden={!visible}
              className={`absolute inset-2 overflow-hidden rounded-[8px] transition-opacity duration-300 ease-out motion-reduce:transition-none ${visible ? "opacity-100" : "pointer-events-none opacity-0"}`}
            >
              <LandingImage
                asset={slide.asset}
                alt={slide.alt}
                fill
                sizes="(min-width: 1024px) 616px, calc(100vw - 40px)"
                priority={position === 0}
                className="object-cover"
              />
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex min-h-11 items-center justify-end gap-1">
        <Button type="button" variant="ghost" aria-label={t.landing.heroPrevious} onClick={() => go(current - 1)} className="h-11 w-11 rounded-[8px]">
          <ChevronLeft size={20} aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          aria-label={automatic ? t.landing.heroPause : t.landing.heroPlay}
          aria-pressed={userPaused}
          onClick={() => {
            if (automatic) {
              setUserPaused(true);
              setPlayRequested(false);
            } else {
              setUserPaused(false);
              setPlayRequested(true);
            }
          }}
          className="h-11 w-11 rounded-[8px]"
        >
          {automatic ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
        </Button>
        <Button type="button" variant="ghost" aria-label={t.landing.heroNext} onClick={() => go(current + 1)} className="h-11 w-11 rounded-[8px]">
          <ChevronRight size={20} aria-hidden="true" />
        </Button>
      </div>

      <div className="mt-1 flex items-center justify-center" role="group" aria-label={t.landing.heroCarouselLabel}>
        {slides.map((slide, position) => (
          <Button
            key={slide.id}
            type="button"
            aria-label={t.landing.heroGoTo.replace("{n}", String(position + 1))}
            aria-current={position === current}
            onClick={() => go(position)}
            className="h-6 w-6 rounded-[8px]"
          >
            <span className={`block h-2.5 w-2.5 rounded-full border border-primary transition-colors duration-200 ease-out ${position === current ? "bg-primary" : "bg-background"}`} />
          </Button>
        ))}
      </div>
    </div>
  );
}
