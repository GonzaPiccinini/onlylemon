import type { ComponentProps, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  variant?: ComponentProps<typeof Badge>["variant"];
  icon?: LucideIcon;
  className?: string;
  children: ReactNode;
  /** When true, adds a pulsing glow — use for live/active statuses only. */
  pulse?: boolean;
}

/** A status pill with an optional leading icon. Keep semantic variants/colors;
 *  this only unifies the shape + icon treatment across the dashboard. */
export const StatusBadge = ({ variant, icon: Icon, className, children, pulse }: StatusBadgeProps) => (
  <Badge variant={variant} className={cn(pulse && "animate-glow-pulse", className)}>
    {Icon ? <Icon data-icon="inline-start" aria-hidden="true" /> : null}
    {children}
  </Badge>
);
