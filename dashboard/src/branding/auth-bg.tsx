import type { HTMLAttributes } from "react";

export interface BrandAuthBackgroundProps extends HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export function BrandAuthBackground({ className, ...rest }: BrandAuthBackgroundProps) {
  return (
    <div
      aria-hidden="true"
      className={[
        "pointer-events-none absolute inset-0 -z-10",
        "auth-bg-gradient",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    />
  );
}
