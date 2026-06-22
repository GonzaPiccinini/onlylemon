import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description: string;
  actions?: ReactNode;
  /** Extra classes for the description — e.g. "hidden md:block" to hide it on mobile. */
  descriptionClassName?: string;
}

export const PageHeader = ({
  title,
  description,
  actions,
  descriptionClassName,
}: PageHeaderProps) => {
  return (
    <header className="flex shrink-0 flex-col gap-3 rounded-2xl border bg-card/95 p-5 shadow-sm md:flex-row md:items-center md:justify-between">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-xl leading-tight md:text-2xl">{title}</h1>
        <p className={cn("text-sm text-muted-foreground", descriptionClassName)}>
          {description}
        </p>
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
};
