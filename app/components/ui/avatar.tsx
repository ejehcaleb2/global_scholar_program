"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { useCopy } from "@/lib/copy/provider";
import { useAvatarQuery } from "@/lib/queries/index";

export function Avatar({ userId, name, email = "", avatarKey, updatedAt, large = false }: { userId: string; name?: string | null; email?: string; avatarKey?: string | null; updatedAt?: string | null; large?: boolean }) {
  const { t } = useCopy();
  const query = useAvatarQuery(userId, avatarKey, updatedAt, large ? 512 : 96);
  const [image, setImage] = useState<{ blob: Blob; src: string } | null>(null);
  // Server data is fetched by React Query; this effect only converts a local Blob.
  useEffect(() => {
    if (!query.data) return;
    const blob = query.data;
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string") setImage({ blob, src: reader.result }); };
    reader.readAsDataURL(blob);
    return () => { reader.onload = null; if (reader.readyState === FileReader.LOADING) reader.abort(); };
  }, [query.data]);
  const initials = (name?.trim() || email.split("@")[0]).split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0]?.toUpperCase()).join("");
  const src = avatarKey && image && image.blob === query.data ? image.src : null;
  return <span role="img" aria-label={t.common.avatarPhoto.replace("{name}", name?.trim() || email || t.common.student)} className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[8px] border border-border bg-surface-alt font-semibold text-primary ${large ? "h-20 w-20 text-xl" : "h-10 w-10 text-sm"}`}>
    {src ? <Image src={src} alt="" fill sizes={large ? "80px" : "40px"} unoptimized className="object-cover" /> : initials || <UserRound size={20} aria-hidden="true" />}
  </span>;
}
