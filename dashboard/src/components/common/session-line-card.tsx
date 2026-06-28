import type { ComponentType, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { StatusRingAvatar } from './status-ring-avatar';
import { SessionStatusBadge } from './session-status-badge';

interface SessionLineCardProps {
  /** WAHA status string — drives StatusRingAvatar ring + SessionStatusBadge. */
  status: string;
  /** Primary identity text (alias or phone number). NEVER a raw session ID. */
  title: ReactNode;
  /** Secondary identity text shown in muted colour below title. */
  subtitle?: ReactNode;
  /** Icon passed through to StatusRingAvatar. Defaults to SmartphoneIcon. */
  icon?: ComponentType<{ className?: string }>;
  /** If provided, the card becomes a focusable button with click + hover states. */
  onClick?: () => void;
  /** Slot for icon buttons or other inline controls (right side). */
  actions?: ReactNode;
  /** Rightmost trailing element — e.g. a ChevronRight icon. */
  trailing?: ReactNode;
  className?: string;
}

const sharedClass = (isClickable: boolean, className?: string) =>
  cn(
    'flex w-full items-center gap-3 rounded-xl glass-subtle px-3 py-3 text-left transition-all duration-200',
    isClickable && [
      'cursor-pointer',
      'hover:border-primary/20 hover:bg-primary/5',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
    ],
    className,
  );

const Inner = ({
  status,
  title,
  subtitle,
  icon,
  actions,
  trailing,
}: Omit<SessionLineCardProps, 'onClick' | 'className'>) => (
  <>
    <StatusRingAvatar status={status} icon={icon} size="md" className="shrink-0" />

    <div className="min-w-0 flex-1">
      <div className="truncate text-sm font-medium leading-tight">{title}</div>
      {subtitle != null ? (
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {subtitle}
        </div>
      ) : null}
    </div>

    <SessionStatusBadge status={status} className="shrink-0" />

    {actions != null ? (
      <div className="flex shrink-0 items-center gap-1">{actions}</div>
    ) : null}

    {trailing != null ? (
      <div className="shrink-0 text-muted-foreground">{trailing}</div>
    ) : null}
  </>
);

/**
 * Reusable session row consumed by both the cashier and admin screens.
 * When onClick is provided the card becomes a button; otherwise a div.
 * NEVER renders a raw session id — title/subtitle carry only human identifiers.
 */
export const SessionLineCard = ({
  status,
  title,
  subtitle,
  icon,
  onClick,
  actions,
  trailing,
  className,
}: SessionLineCardProps) => {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={sharedClass(true, className)}
      >
        <Inner
          status={status}
          title={title}
          subtitle={subtitle}
          icon={icon}
          actions={actions}
          trailing={trailing}
        />
      </button>
    );
  }

  return (
    <div className={sharedClass(false, className)}>
      <Inner
        status={status}
        title={title}
        subtitle={subtitle}
        icon={icon}
        actions={actions}
        trailing={trailing}
      />
    </div>
  );
};
