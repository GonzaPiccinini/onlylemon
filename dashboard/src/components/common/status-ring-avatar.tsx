import type { ComponentType } from 'react';
import { SmartphoneIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { wahaStatusRing } from '@/lib/waha-status';

interface StatusRingAvatarProps {
  status: string;
  icon?: ComponentType<{ className?: string }>;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Circular avatar with a status-colored ring.
 * WORKING → success ring; SCAN_QR_CODE/STARTING → primary ring + glow-pulse;
 * STOPPED/UNLINKED → muted ring; FAILED → destructive ring.
 *
 * The outer span carries the glow-pulse animation (box-shadow based) while the
 * inner circle carries the Tailwind ring (also box-shadow based). Splitting them
 * onto separate elements prevents the two box-shadow values from conflicting.
 */
export const StatusRingAvatar = ({
  status,
  icon: Icon = SmartphoneIcon,
  size = 'md',
  className,
}: StatusRingAvatarProps) => {
  const ringClass = wahaStatusRing(status);
  const pulse = status === 'SCAN_QR_CODE' || status === 'STARTING';

  return (
    <span
      className={cn(
        'relative inline-flex rounded-full',
        // Outer span: glow-pulse here so its box-shadow doesn't conflict with ring-* on the inner span.
        // prefers-reduced-motion: existing global CSS already disables animate-glow-pulse.
        pulse && 'animate-glow-pulse',
        className,
      )}
    >
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-full bg-primary/10 text-primary',
          size === 'sm' ? 'size-8' : 'size-10',
          ringClass,
        )}
      >
        <Icon
          className={size === 'sm' ? 'size-4' : 'size-5'}
          aria-hidden="true"
        />
      </span>
    </span>
  );
};
