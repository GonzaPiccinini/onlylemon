import type { ComponentType, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { AccentIconBadge } from "@/components/common/icon-badge";

interface PageHeaderProps {
  title: string;
  description: string;
  actions?: ReactNode;
  /** Extra classes for the description — e.g. "hidden md:block" to hide it on mobile. */
  descriptionClassName?: string;
  /** Optional lucide icon rendered as a leading chip next to the title. */
  icon?: ComponentType<{ className?: string }>;
}

export const PageHeader = ({
  title,
  description,
  actions,
  descriptionClassName,
  icon: Icon,
}: PageHeaderProps) => {
  return (
    <header className="flex shrink-0 flex-col gap-3 rounded-2xl glass p-5 md:flex-row md:items-center md:justify-between animate-in fade-in slide-in-from-top-2 duration-500">
      <div className="flex items-start gap-3">
        {Icon ? (
          <AccentIconBadge size="lg" className="mt-0.5">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </AccentIconBadge>
        ) : null}
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-xl leading-tight md:text-2xl text-accent-gradient">{title}</h1>
          <p className={cn("text-sm text-muted-foreground", descriptionClassName)}>
            {description}
          </p>
        </div>
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
};
