import { StatusBadge } from '@/components/common/status-badge';
import { formatDateTime } from '@/lib/format';
import { leadStatusBadge, leadStatusLabel } from '@/lib/lead-status';
import { cn } from '@/lib/utils';
import type { LeadStatus } from '@/types/domain';

type TimelineEntry = {
  status: LeadStatus;
  at: string;
};

type LeadStatusTimelineProps = {
  timeline: TimelineEntry[];
  className?: string;
};

export const LeadStatusTimeline = ({
  timeline,
  className,
}: LeadStatusTimelineProps) => {
  if (!timeline || timeline.length === 0) {
    return <span className='text-muted-foreground'>—</span>;
  }

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {timeline.map((entry) => {
        const { variant, icon, className: badgeClassName } = leadStatusBadge(
          entry.status,
        );
        return (
        <div key={entry.status} className='flex items-center gap-1.5'>
          <StatusBadge
            variant={variant}
            icon={icon}
            className={cn('shrink-0', badgeClassName)}
          >
            {leadStatusLabel(entry.status)}
          </StatusBadge>
          <time
            dateTime={entry.at}
            className='text-xs text-muted-foreground whitespace-nowrap'
          >
            {formatDateTime(entry.at)}
          </time>
        </div>
        );
      })}
    </div>
  );
};
