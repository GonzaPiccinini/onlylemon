import { useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  leadStatusBadge,
  leadDisplayStatusLabel,
  type FullTimelineEntry,
} from '@/lib/lead-status';
import { formatDateTime } from '@/lib/format';

// ─── Relative-time helper ─────────────────────────────────────────────────────

function formatRelativeTime(isoString: string): string {
  const diffSeconds = Math.round((new Date(isoString).getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  // Pick the coarsest unit whose magnitude is >= 1, computing each value straight
  // from the raw second diff (no chained rounding, correct for past and future).
  for (const [unit, secs] of units) {
    const value = diffSeconds / secs;
    if (Math.abs(value) >= 1) return rtf.format(Math.round(value), unit);
  }
  return rtf.format(diffSeconds, 'second');
}

// ─── Grouping ─────────────────────────────────────────────────────────────────

type PrimaryNode = {
  kind: 'primary';
  entry: FullTimelineEntry;
};

type RecargaGroupNode = {
  kind: 'recarga-group';
  entries: FullTimelineEntry[];
};

type TimelineNode = PrimaryNode | RecargaGroupNode;

function groupEntries(entries: FullTimelineEntry[]): TimelineNode[] {
  const nodes: TimelineNode[] = [];
  let i = 0;
  while (i < entries.length) {
    if (entries[i].status === 'RECARGA') {
      const group: FullTimelineEntry[] = [];
      while (i < entries.length && entries[i].status === 'RECARGA') {
        group.push(entries[i]);
        i++;
      }
      nodes.push({ kind: 'recarga-group', entries: group });
    } else {
      nodes.push({ kind: 'primary', entry: entries[i] });
      i++;
    }
  }
  return nodes;
}

// ─── Variant → Tailwind class maps ────────────────────────────────────────────

const variantDotClass: Record<string, string> = {
  converted: 'bg-primary',
  progress: 'bg-accent-violet',
  recharge: 'bg-recharge',
  neutral: 'bg-secondary-foreground',
};

const variantTextClass: Record<string, string> = {
  converted: 'text-primary',
  progress: 'text-accent-violet',
  recharge: 'text-recharge',
  neutral: 'text-secondary-foreground',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

interface EntryTimeProps {
  at: string;
}

const EntryTime = ({ at }: EntryTimeProps) => (
  <time dateTime={at} className='flex flex-col gap-0'>
    <span className='text-xs font-medium text-foreground/90'>
      {formatRelativeTime(at)}
    </span>
    <span className='text-[11px] leading-tight text-muted-foreground'>
      {formatDateTime(at)}
    </span>
  </time>
);

// ─── Component ────────────────────────────────────────────────────────────────

export interface LeadTimelineProps {
  entries: FullTimelineEntry[];
}

export function LeadTimeline({ entries }: LeadTimelineProps) {
  const nodes = groupEntries(entries);
  const lastIndex = nodes.length - 1;
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());

  const toggleGroup = (index: number) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  if (nodes.length === 0) return null;

  return (
    <ol className='relative flex flex-col gap-0'>
      {nodes.map((node, nodeIndex) => {
        const isLast = nodeIndex === lastIndex;

        if (node.kind === 'primary') {
          const { entry } = node;
          const { variant, icon: Icon } = leadStatusBadge(entry.status);
          const dotClass = variantDotClass[variant] ?? 'bg-secondary-foreground';
          const textClass = variantTextClass[variant] ?? 'text-secondary-foreground';

          return (
            <li
              key={`${entry.status}-${entry.at}-${nodeIndex}`}
              className='relative flex gap-3 pb-4'
            >
              {/* Vertical rail */}
              {!isLast && (
                <div
                  aria-hidden='true'
                  className='absolute bottom-0 left-3 top-6 w-px bg-border'
                />
              )}
              {/* Node dot */}
              <div
                className={cn(
                  'relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-shadow',
                  dotClass,
                  isLast && 'ring-2 ring-primary/60',
                )}
              >
                <Icon className='size-3 text-background' aria-hidden='true' />
              </div>
              {/* Content */}
              <div className='flex flex-col gap-0.5 pt-0.5'>
                <span className={cn('text-xs font-semibold leading-tight', textClass)}>
                  {leadDisplayStatusLabel(entry.status)}
                </span>
                <EntryTime at={entry.at} />
              </div>
            </li>
          );
        }

        // RECARGA group node
        const { entries: recargaEntries } = node;
        const isExpanded = expandedGroups.has(nodeIndex);
        const { variant, icon: Icon } = leadStatusBadge('RECARGA');
        const dotClass = variantDotClass[variant] ?? 'bg-secondary-foreground';
        const textClass = variantTextClass[variant] ?? 'text-secondary-foreground';
        const firstEntry = recargaEntries[0];
        const lastEntry = recargaEntries[recargaEntries.length - 1];
        const groupLabel =
          recargaEntries.length === 1 ? '1 recarga' : `${recargaEntries.length} recargas`;
        const panelId = `recarga-entries-${nodeIndex}`;

        return (
          <li
            key={`recarga-group-${nodeIndex}`}
            className='relative flex gap-3 pb-4'
          >
            {/* Vertical rail */}
            {!isLast && (
              <div
                aria-hidden='true'
                className='absolute bottom-0 left-3 top-6 w-px bg-border'
              />
            )}
            {/* Node dot */}
            <div
              className={cn(
                'relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-shadow',
                dotClass,
                isLast && 'ring-2 ring-primary/60',
              )}
            >
              <Icon className='size-3 text-background' aria-hidden='true' />
            </div>
            {/* Content */}
            <div className='flex flex-col gap-0.5 pt-0.5'>
              <button
                type='button'
                onClick={() => toggleGroup(nodeIndex)}
                className={cn(
                  'flex items-center gap-1 text-xs font-semibold leading-tight transition-opacity hover:opacity-80',
                  textClass,
                )}
                aria-expanded={isExpanded}
                aria-controls={panelId}
              >
                {isExpanded ? (
                  <ChevronDownIcon className='size-3' aria-hidden='true' />
                ) : (
                  <ChevronRightIcon className='size-3' aria-hidden='true' />
                )}
                {groupLabel}
              </button>
              {!isExpanded && (
                <span className='text-[11px] leading-tight text-muted-foreground'>
                  {formatDateTime(firstEntry.at)}
                  {recargaEntries.length > 1 && ` – ${formatDateTime(lastEntry.at)}`}
                </span>
              )}
              {isExpanded && (
                <ol id={panelId} className='mt-1 flex flex-col gap-2 pl-1'>
                  {recargaEntries.map((e, i) => (
                    <li key={`${e.at}-${i}`}>
                      <EntryTime at={e.at} />
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
