import type { Lead, LeadHistoryPage, LeadStatus } from '@/types/domain';

export type LeadDisplayStatus = LeadStatus | 'RECARGA';

const statusLabelMap: Record<LeadStatus, string> = {
  NOT_CONTACTED: 'No contactado',
  CONTACTED: 'Contactado',
  CONVERTED: 'Convertido',
};

const displayStatusLabelMap: Record<LeadDisplayStatus, string> = {
  ...statusLabelMap,
  RECARGA: 'Recarga',
};

export const leadStatusLabel = (status: LeadStatus): string =>
  statusLabelMap[status] ?? status;

export const leadDisplayStatusLabel = (status: LeadDisplayStatus): string =>
  displayStatusLabelMap[status] ?? status;

export const leadDisplayStatus = (
  lead: Pick<Lead, 'status' | 'conversionsCount'>,
): LeadDisplayStatus => {
  const count = lead.conversionsCount ?? 0;
  if (lead.status === 'CONVERTED' && count >= 2) {
    return 'RECARGA';
  }
  return lead.status;
};

export type FullTimelineEntry = {
  status: LeadDisplayStatus;
  at: string;
};

export const buildFullStatusTimeline = (
  history: Pick<LeadHistoryPage, 'createdAt' | 'contactedAt' | 'conversions' | 'firstConversionAt'>,
): FullTimelineEntry[] => {
  const entries: FullTimelineEntry[] = [
    { status: 'NOT_CONTACTED', at: history.createdAt },
  ];
  if (history.contactedAt) {
    entries.push({ status: 'CONTACTED', at: history.contactedAt });
  }
  history.conversions.forEach((conv) => {
    // Label as CONVERTED only if this conversion is the lead's very first one
    // (identified by matching firstConversionAt from backend). All others are RECARGA.
    const isFirst =
      history.firstConversionAt !== null &&
      conv.at === history.firstConversionAt;
    entries.push({
      status: isFirst ? 'CONVERTED' : 'RECARGA',
      at: conv.at,
    });
  });
  entries.sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );
  return entries;
};
