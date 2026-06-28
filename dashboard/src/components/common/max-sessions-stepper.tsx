import { MinusIcon, PlusIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface MaxSessionsStepperProps {
  value: number;
  min: number;
  max?: number;
  onChange: (value: number) => Promise<void> | void;
  /** Defaults to "Máximo". Pass null to hide the label entirely. */
  label?: string | null;
  isPending?: boolean;
  className?: string;
}

/**
 * Segmented [ − N + ] stepper rendered as a glass-subtle pill.
 * − is disabled when value <= min; + is disabled when value >= max.
 * Replaces the pencil→number-input dance of MaxSessionsEditor (not yet wired in).
 */
export const MaxSessionsStepper = ({
  value,
  min,
  max,
  onChange,
  label = 'Máximo',
  isPending = false,
  className,
}: MaxSessionsStepperProps) => {
  const atMin = value <= min;
  const atMax = max !== undefined && value >= max;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {label != null && (
        <span className="text-xs text-muted-foreground">{label}</span>
      )}
      {/* overflow-hidden clips the ghost button hover backgrounds to the pill's rounded corners */}
      <div className="inline-flex overflow-hidden rounded-lg glass-subtle">
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          onClick={() => void onChange(value - 1)}
          disabled={atMin || isPending}
          aria-label={`Disminuir ${label ?? 'valor'}`}
          className="rounded-none border-0 focus-visible:ring-inset"
        >
          <MinusIcon />
        </Button>
        <span
          className="flex min-w-[2.5ch] select-none items-center justify-center px-1.5 text-xs font-medium tabular-nums"
          aria-live="polite"
          aria-atomic="true"
        >
          {value}
        </span>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          onClick={() => void onChange(value + 1)}
          disabled={atMax || isPending}
          aria-label={`Aumentar ${label ?? 'valor'}`}
          className="rounded-none border-0 focus-visible:ring-inset"
        >
          <PlusIcon />
        </Button>
      </div>
    </div>
  );
};
