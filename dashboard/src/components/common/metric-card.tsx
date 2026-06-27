import type { ComponentType } from "react";
import { TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string;
  hint?: string;
  /** Optional lucide icon rendered in a tinted chip in the card header. */
  icon?: ComponentType<{ className?: string }>;
  /** Optional trend direction — pairs with `delta` to show a trend indicator. */
  trend?: "up" | "down";
  /** Delta text shown alongside the trend icon (e.g. "+12%"). Requires `trend`. */
  delta?: string;
}

export const MetricCard = ({ label, value, hint, icon: Icon, trend, delta }: MetricCardProps) => {
  const hasTrend = trend !== undefined && delta !== undefined;

  return (
    <Card className="glass relative overflow-hidden transition-all duration-300 hover:shadow-[0_0_24px_-4px_color-mix(in_oklab,var(--primary)_20%,transparent)] animate-in fade-in duration-500">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardDescription>{label}</CardDescription>
          {Icon ? (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg accent-gradient text-primary-foreground animate-glow-pulse">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
          ) : null}
        </div>
        <CardTitle className="font-heading text-xl tabular-nums whitespace-nowrap text-accent-gradient">
          {value}
        </CardTitle>
      </CardHeader>
      {(hint || hasTrend) ? (
        <CardContent className="flex flex-col gap-1">
          {hasTrend ? (
            <p
              className={cn(
                "flex items-center gap-1 text-xs font-medium",
                trend === "up" ? "text-emerald-500" : "text-rose-500",
              )}
            >
              {trend === "up" ? (
                <TrendingUpIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <TrendingDownIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
              {delta}
            </p>
          ) : null}
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </CardContent>
      ) : null}
    </Card>
  );
};
