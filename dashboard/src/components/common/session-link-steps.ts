import { CheckCircle2Icon, LoaderIcon, QrCodeIcon } from 'lucide-react';

/**
 * Steps a cashier walks through while linking a WhatsApp session, mapped to the
 * real WAHA statuses:
 *   0 Iniciando   -> STARTING before the QR is ready
 *   1 Escaneá     -> SCAN_QR_CODE (QR visible, waiting for the scan)
 *   2 Conectando  -> STARTING again after the QR was shown (post-scan settling)
 *   3 Listo       -> WORKING
 *
 * WAHA may jump SCAN_QR_CODE -> WORKING without a distinct "connecting" status,
 * so step 2 can be brief or skipped; the stepper still reads coherently because
 * every step before `currentStep` renders as completed.
 */
export const LINK_STEPS = [
  { label: 'Iniciando', icon: LoaderIcon, spins: true },
  { label: 'Escaneá', icon: QrCodeIcon, spins: false },
  { label: 'Conectando', icon: LoaderIcon, spins: true },
  { label: 'Listo', icon: CheckCircle2Icon, spins: false },
] as const;

/**
 * Step index (0-3) from the real WAHA status. `reachedQr` disambiguates the two
 * STARTING moments: before the QR is up (0) vs. connecting after the scan (2).
 */
export const computeLinkStep = (
  status: string | undefined | null,
  reachedQr: boolean,
): number => {
  if (status === 'WORKING') return 3;
  if (status === 'SCAN_QR_CODE') return 1;
  if (status === 'STARTING') return reachedQr ? 2 : 0;
  return 0;
};
