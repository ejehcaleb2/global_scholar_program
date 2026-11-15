"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api/index";

export function useRateLimit() {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (remaining <= 0) return;
    const deadline = Date.now() + remaining * 1000;
    const timer = window.setInterval(() => setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))), 1000);
    return () => window.clearInterval(timer);
    // A new countdown value starts a new interval with the remaining duration.
  }, [remaining]);
  function accept(error: unknown): boolean {
    if (!(error instanceof ApiError) || error.status !== 429) return false;
    setRemaining(Math.max(1, error.retryAfter ?? 1));
    return true;
  }
  return { remaining, accept };
}
