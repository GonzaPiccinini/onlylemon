import type { LeadStatus } from '@/types/domain';

const statusLabelMap: Record<LeadStatus, string> = {
  NOT_CONTACTED: 'No contactado',
  CONTACTED: 'Contactado',
  CONVERTED: 'Convertido',
  EXPIRED: 'Expirado',
};

export const leadStatusLabel = (status: LeadStatus): string =>
  statusLabelMap[status] ?? status;
