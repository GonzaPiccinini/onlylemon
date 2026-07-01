import {
  CheckCircle2Icon,
  LoaderIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { LINK_STEPS } from '@/components/common/session-link-steps';

/** Centered spinner panel used for the booting and connecting link steps. */
export const LinkLoaderPanel = ({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) => (
  <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center">
    <LoaderIcon className="size-7 animate-spin text-primary" />
    <p className="text-sm font-medium">{title}</p>
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
  </div>
);

interface SessionLinkStepperProps {
  /** Index of the active step (0-3). */
  currentStep: number;
  /** When true, the active step is rendered as an error instead of in-progress. */
  failed?: boolean;
  className?: string;
}

export const SessionLinkStepper = ({
  currentStep,
  failed = false,
  className,
}: SessionLinkStepperProps) => {
  return (
    <ol className={cn('flex items-start', className)}>
      {LINK_STEPS.map((step, index) => {
        const isCompleted = index < currentStep;
        const isActive = index === currentStep;
        const isFailedHere = isActive && failed;

        let Icon: LucideIcon = step.icon;
        if (isCompleted) Icon = CheckCircle2Icon;
        if (isFailedHere) Icon = TriangleAlertIcon;

        const spinning = isActive && !failed && step.spins;

        return (
          <li
            key={step.label}
            className="flex flex-1 flex-col items-center gap-1.5"
          >
            <div className="flex w-full items-center">
              {/* left connector (hidden on first) */}
              <span
                className={cn(
                  'h-0.5 flex-1 rounded-full',
                  index === 0
                    ? 'opacity-0'
                    : isCompleted || isActive
                      ? 'bg-primary'
                      : 'bg-border',
                )}
                aria-hidden="true"
              />
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full border transition-colors',
                  isCompleted &&
                    'border-transparent bg-primary/15 text-primary',
                  isActive &&
                    !failed &&
                    'border-transparent bg-primary text-primary-foreground glow-sm',
                  isFailedHere &&
                    'border-transparent bg-destructive text-white',
                  !isCompleted &&
                    !isActive &&
                    'border-border bg-muted/30 text-muted-foreground/60',
                )}
              >
                <Icon className={cn('size-4', spinning && 'animate-spin')} />
              </span>
              {/* right connector (hidden on last) */}
              <span
                className={cn(
                  'h-0.5 flex-1 rounded-full',
                  index === LINK_STEPS.length - 1
                    ? 'opacity-0'
                    : isCompleted
                      ? 'bg-primary'
                      : 'bg-border',
                )}
                aria-hidden="true"
              />
            </div>
            <span
              className={cn(
                'text-center text-2xs leading-tight',
                isActive
                  ? failed
                    ? 'font-medium text-destructive'
                    : 'font-medium text-foreground'
                  : isCompleted
                    ? 'text-primary'
                    : 'text-muted-foreground',
              )}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
};
