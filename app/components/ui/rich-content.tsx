"use client";

import { sanitizeHtml } from "@/lib/utils/html";

export function RichContent({ html, className = "" }: { html: string; className?: string }) {
  return <div className={`prose-gsp ${className}`} dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />;
}