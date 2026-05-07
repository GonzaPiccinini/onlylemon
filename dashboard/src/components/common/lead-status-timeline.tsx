import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/format';
import { leadStatusLabel } from '@/lib/lead-status';
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
      {timeline.map((entry) => (
        <div key={entry.status} className='flex items-center gap-1.5'>
          <Badge
            variant={entry.status === 'CONVERTED' ? 'default' : 'outline'}
            className='shrink-0'
          >
            {leadStatusLabel(entry.status)}
          </Badge>
          <time
            dateTime={entry.at}
            className='text-xs text-muted-foreground whitespace-nowrap'
          >
            {formatDateTime(entry.at)}
          </time>
        </div>
      ))}
    </div>
  );
};
