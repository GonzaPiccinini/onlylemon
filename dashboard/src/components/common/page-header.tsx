import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description: string;
  actions?: ReactNode;
}

export const PageHeader = ({ title, description, actions }: PageHeaderProps) => {
  return (
    <header className="flex flex-col gap-3 rounded-2xl border bg-card/95 p-5 shadow-sm md:flex-row md:items-center md:justify-between">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-xl leading-tight md:text-2xl">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
};
