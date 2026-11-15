"use client";

import { RouteError } from "@/components/ui/route-error";

export default function AdminErrorPage({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return <RouteError reset={reset} />;
}