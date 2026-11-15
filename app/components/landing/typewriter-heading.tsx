"use client";

import { useEffect, useState } from "react";

const HOLD_MS = 2500;
const ERASE_MS = 25;
const GAP_MS = 500;
const TYPE_MS = 55;

type Phase = "hold" | "erase" | "gap" | "type";

export function TypewriterHeading({ text, className = "" }: { text: string; className?: string }) {
  // State is tagged with its text so a text change instantly falls back to the full heading.
  const [state, setState] = useState<{ text: string; shown: number | null; phase: Phase }>({ text, shown: null, phase: "hold" });
  const [reducedMotion, setReducedMotion] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const current = state.text === text ? state : { text, shown: null, phase: "hold" as Phase };
  const shown = current.shown ?? text.length;
  const phase = current.phase;

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    const onVisibility = () => setTabHidden(document.hidden);
    update();
    onVisibility();
    query.addEventListener("change", update);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      query.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const animate = !reducedMotion && !tabHidden;

  // Restarts from the full text whenever the text changes or animation resumes.
  useEffect(() => {
    let length = text.length;
    let timer: number | undefined;
    const show = (next: Phase) => setState({ text, shown: length === text.length ? null : length, phase: next });

    const run = (next: Phase) => {
      show(next);
      if (!animate) return;
      if (next === "hold") timer = window.setTimeout(() => run("erase"), HOLD_MS);
      else if (next === "gap") timer = window.setTimeout(() => run("type"), GAP_MS);
      else if (next === "erase") {
        if (length === 0) return run("gap");
        length -= 1;
        show(next);
        timer = window.setTimeout(() => run("erase"), ERASE_MS);
      } else {
        if (length >= text.length) return run("hold");
        length += 1;
        show(next);
        timer = window.setTimeout(() => run("type"), TYPE_MS);
      }
    };
    timer = window.setTimeout(() => run("hold"), 0);
    return () => window.clearTimeout(timer);
  }, [text, animate]);

  return (
    <h1 className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className="grid">
        <span className="invisible col-start-1 row-start-1">{text}</span>
        <span className="col-start-1 row-start-1">
          {text.slice(0, shown)}
          <span className={`ml-0.5 inline-block h-[0.9em] w-[3px] translate-y-[0.1em] bg-primary ${phase === "hold" && animate ? "gsp-caret-blink" : ""} ${animate || shown < text.length ? "" : "opacity-0"}`} />
        </span>
      </span>
    </h1>
  );
}
