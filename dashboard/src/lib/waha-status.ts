import {
  CheckCircle2Icon,
  CircleDashedIcon,
  LoaderIcon,
  QrCodeIcon,
  TriangleAlertIcon,
  UnplugIcon,
  type LucideIcon,
} from 'lucide-react';

export type WahaStatusValue =
  | 'WORKING'
  | 'SCAN_QR_CODE'
  | 'STARTING'
  | 'STOPPED'
  | 'FAILED'
  | 'UNLINKED'
  | (string & {});

const LABELS: Record<string, string> = {
  WORKING: 'Conectado',
  SCAN_QR_CODE: 'Escaneando QR',
  STARTING: 'Iniciando',
  STOPPED: 'Detenido',
  FAILED: 'Error',
  UNLINKED: 'Sin vincular',
};

export const wahaStatusLabel = (status: string | undefined | null): string => {
  if (!status) return LABELS.UNLINKED;
  return LABELS[status] ?? status;
};

export type BadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive';

export const wahaStatusVariant = (
  status: string | undefined | null,
): BadgeVariant => {
  if (status === 'WORKING') return 'default';
  if (status === 'SCAN_QR_CODE' || status === 'STARTING') return 'secondary';
  if (status === 'FAILED') return 'destructive';
  return 'outline';
};

export const wahaStatusIcon = (
  status: string | undefined | null,
): LucideIcon => {
  switch (status) {
    case 'WORKING':
      return CheckCircle2Icon;
    case 'SCAN_QR_CODE':
      return QrCodeIcon;
    case 'STARTING':
      return LoaderIcon;
    case 'FAILED':
      return TriangleAlertIcon;
    case 'UNLINKED':
      return UnplugIcon;
    case 'STOPPED':
    default:
      return CircleDashedIcon;
  }
};
