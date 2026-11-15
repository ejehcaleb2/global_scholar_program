"use client";

import Image, { type ImageProps } from "next/image";
import { ImageOff } from "lucide-react";
import { useState } from "react";

type MediaImageProps = Omit<ImageProps, "src"> & {
  src: string | null;
  wrapperClassName?: string;
};

export function MediaImage({ src, alt, wrapperClassName = "relative", ...imageProps }: MediaImageProps) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const isAvailable = Boolean(src && failedSource !== src);

  return <span className={wrapperClassName} role={alt ? "img" : "presentation"} aria-label={alt || undefined}>
    {isAvailable && src
      ? <Image {...imageProps} src={src} alt={alt} unoptimized={imageProps.unoptimized ?? true} onError={() => setFailedSource(src)} />
      : <span className="flex h-full w-full items-center justify-center bg-surface-alt" aria-hidden="true"><ImageOff size={20} className="text-text" /></span>}
  </span>;
}
