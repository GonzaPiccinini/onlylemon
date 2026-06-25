import type { ComponentProps, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface StatusBadgeProps {
  variant?: ComponentProps<typeof Badge>["variant"];
  icon?: LucideIcon;
  className?: string;
  children: ReactNode;
}

/** A status pill with an optional leading icon. Keep semantic variants/colors;
 *  this only unifies the shape + icon treatment across the dashboard. */
export const StatusBadge = ({ variant, icon: Icon, className, children }: StatusBadgeProps) => (
  <Badge variant={variant} className={className}>
    {Icon ? <Icon data-icon="inline-start" /> : null}
    {children}
  </Badge>
);
