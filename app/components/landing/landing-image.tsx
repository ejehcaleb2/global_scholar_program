"use client";

import Image, { type ImageLoaderProps, type ImageProps } from "next/image";
import landingMedia from "@/lib/landing-media.json";

export type LandingMediaAsset = (typeof landingMedia)[number];

export function getLandingMedia(id: LandingMediaAsset["id"]): LandingMediaAsset {
  const asset = landingMedia.find((item) => item.id === id);
  if (!asset) throw new Error(`Missing generated landing media: ${id}`);
  return asset;
}

type LandingImageProps = Omit<ImageProps, "src" | "loader"> & {
  asset: LandingMediaAsset;
};

export function LandingImage({ asset, alt, ...imageProps }: LandingImageProps) {
  const largest = asset.variants[asset.variants.length - 1];
  const loader = ({ width }: ImageLoaderProps) => {
    const variant = asset.variants.find((item) => item.width >= width) ?? largest;
    return variant.url;
  };

  return <Image {...imageProps} alt={alt} src={largest.url} loader={loader} />;
}
