import { cn } from '@/lib/utils';

interface CapacityMeterProps {
  used: number;
  total: number;
  label?: string;
  className?: string;
}

/**
 * Segmented capacity meter: `total` small pills, `used` filled with bg-primary,
 * remainder shown as muted/bordered. The segment group is decorative (aria-hidden);
 * the text label carries the accessible meaning.
 */
export const CapacityMeter = ({
  used,
  total,
  label,
  className,
}: CapacityMeterProps) => {
  const safeTotal = Math.max(1, total);
  const safeUsed = Math.min(Math.max(0, used), safeTotal);
  const displayLabel = label ?? `${safeUsed} de ${safeTotal}`;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {/* Decorative segments — aria-hidden; the text below carries the meaning. */}
      <div
        className="flex items-center gap-1"
        aria-hidden="true"
      >
        {Array.from({ length: safeTotal }).map((_, i) => (
          <span
            key={i}
            className={cn(
              'h-1.5 flex-1 rounded-full',
              i < safeUsed
                ? 'bg-primary'
                : 'border border-muted-foreground/20 bg-muted/40',
            )}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">
        {displayLabel}
      </p>
    </div>
  );
};
