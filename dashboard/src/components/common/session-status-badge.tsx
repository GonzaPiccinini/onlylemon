import { StatusBadge } from '@/components/common/status-badge';
import {
  wahaStatusLabel,
  wahaStatusVariant,
  wahaStatusIcon,
} from '@/lib/waha-status';

interface SessionStatusBadgeProps {
  status: string;
  pulse?: boolean;
  className?: string;
}

/**
 * Thin wrapper that maps a WAHA status string to a StatusBadge with the correct
 * variant, icon, and label. Consolidates the logic previously duplicated inline
 * as `WahaStatusBadge` across the cashier and admin screens.
 */
export const SessionStatusBadge = ({
  status,
  pulse,
  className,
}: SessionStatusBadgeProps) => {
  const Icon = wahaStatusIcon(status);
  return (
    <StatusBadge
      variant={wahaStatusVariant(status)}
      icon={Icon}
      pulse={pulse}
      className={className}
    >
      {wahaStatusLabel(status)}
    </StatusBadge>
  );
};
