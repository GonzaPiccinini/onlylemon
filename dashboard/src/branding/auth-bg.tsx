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
        "bg-[radial-gradient(circle_at_10%_10%,rgba(199,242,70,0.24),transparent_34%),radial-gradient(circle_at_90%_0%,rgba(156,198,50,0.15),transparent_42%)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    />
  );
}
