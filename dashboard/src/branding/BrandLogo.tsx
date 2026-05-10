import type { ImgHTMLAttributes } from "react";
import { BRAND_NAME, LOGO_FULL, LOGO_MARK } from "./constants";
import type { BrandLogoVariant } from "./constants";

export interface BrandLogoProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt"> {
  variant?: BrandLogoVariant;
  alt?: string;
  className?: string;
}

export function BrandLogo({
  variant = "full",
  alt = BRAND_NAME,
  className,
  loading = "eager",
  ...rest
}: BrandLogoProps) {
  const src = variant === "mark" ? LOGO_MARK : LOGO_FULL;
  return <img src={src} alt={alt} className={className} loading={loading} {...rest} />;
}
