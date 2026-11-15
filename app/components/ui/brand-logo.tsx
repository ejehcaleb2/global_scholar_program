import { MediaImage } from "@/components/ui/media-image";
import Link from "next/link";
import { copy } from "@/lib/copy/dictionary";

export function BrandLogo({
  size = "site",
  priority = false,
  href = "/",
  ariaLabel = copy.nav.brandHome,
  showName = false,
}: {
  size?: "site" | "auth" | "sidebar" | "footer";
  priority?: boolean;
  href?: string;
  ariaLabel?: string;
  showName?: boolean;
}) {
  const imageClassName = size === "auth"
    ? "h-[72px] w-[72px] object-contain"
    : size === "sidebar"
      ? "h-[72px] w-[72px] object-contain"
      : "h-14 w-14 object-contain";
  const dimension = size === "auth" || size === "sidebar" ? 72 : 56;

  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className="inline-flex shrink-0 items-center gap-2 rounded-[8px] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
    >
      <MediaImage src="/gsp-logo.png" alt="" width={dimension} height={dimension} sizes={`${dimension}px`} className={imageClassName} priority={priority} unoptimized={false} wrapperClassName="block" />
      {showName && <span aria-hidden="true" className="flex flex-col leading-tight text-text"><span className="font-heading text-xl">{copy.nav.brandShortTitle}</span><span className="mt-0.5 text-sm">{copy.nav.brandShortSubtitle}</span></span>}
    </Link>
  );
}
