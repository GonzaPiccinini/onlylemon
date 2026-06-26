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
    <div className={cn('glass-subtle flex flex-col gap-0 rounded-xl p-2.5', className)}>
      {timeline.map((entry, index) => {
        const { variant, icon, className: badgeClassName } = leadStatusBadge(
          entry.status,
        );
        const isLast = index === timeline.length - 1;
        const isActive = entry.status === 'CONTACTED';

        return (
          <div
            key={entry.status}
            className="animate-in fade-in slide-in-from-left-2 [animation-fill-mode:both] [animation-duration:300ms]"
            style={{ animationDelay: `${index * 80}ms` }}
          >
            <div className='flex items-center gap-2 py-1'>
              <StatusBadge
                variant={variant}
                icon={icon}
                className={cn('shrink-0', badgeClassName)}
                pulse={isActive}
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
            {!isLast ? (
              <div
                className='ml-3 h-3 w-0.5 accent-gradient rounded-full opacity-30'
                aria-hidden='true'
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
};
