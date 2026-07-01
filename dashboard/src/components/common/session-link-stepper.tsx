import {
  CheckCircle2Icon,
  LoaderIcon,
  QrCodeIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Steps a cashier walks through while linking a WhatsApp session, mapped to the
 * real WAHA statuses:
 *   0 Iniciando   -> STARTING before the QR is ready
 *   1 Escaneá     -> SCAN_QR_CODE (QR visible, waiting for the scan)
 *   2 Conectando  -> STARTING again after the QR was shown (post-scan settling)
 *   3 Listo       -> WORKING
 *
 * WAHA may jump SCAN_QR_CODE -> WORKING without a distinct "connecting" status,
 * so step 2 can be brief or skipped; the stepper still reads coherently because
 * every step before `currentStep` renders as completed.
 */
export const LINK_STEPS = [
  { label: 'Iniciando', icon: LoaderIcon, spins: true },
  { label: 'Escaneá', icon: QrCodeIcon, spins: false },
  { label: 'Conectando', icon: LoaderIcon, spins: true },
  { label: 'Listo', icon: CheckCircle2Icon, spins: false },
] as const;

/**
 * Step index (0-3) from the real WAHA status. `reachedQr` disambiguates the two
 * STARTING moments: before the QR is up (0) vs. connecting after the scan (2).
 */
export const computeLinkStep = (
  status: string | undefined | null,
  reachedQr: boolean,
): number => {
  if (status === 'WORKING') return 3;
  if (status === 'SCAN_QR_CODE') return 1;
  if (status === 'STARTING') return reachedQr ? 2 : 0;
  return 0;
};

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
