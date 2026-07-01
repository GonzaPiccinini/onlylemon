import { useCallback, useEffect, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import {
  PlusIcon,
  QrCodeIcon,
  SmartphoneIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useCashierSessions,
  useCreateCashierSession,
  useDeleteCashierSession,
  useLinkAdminCashierSession,
  useUpdateCashierMaxSessions,
} from '@/features/admin/admin-hooks';
import { useSetSessionAlias } from '@/features/chat/hooks/useSetSessionAlias';
import { localPhonePart, toArgentinePhone } from '@/lib/phone';
import {
  SessionLinkStepper,
  LinkLoaderPanel,
  computeLinkStep,
} from '@/components/common/session-link-stepper';
import { StatusRingAvatar } from '@/components/common/status-ring-avatar';
import type { Cashier, WhatsappLinkArtifacts, WhatsappSession } from '@/types/domain';
import { SessionLineCard } from '@/components/common/session-line-card';
import { CapacityMeter } from '@/components/common/capacity-meter';
import { MaxSessionsStepper } from '@/components/common/max-sessions-stepper';
import { SessionStatusBadge } from '@/components/common/session-status-badge';
import { InlineRename } from '@/components/common/inline-rename';

type Props = {
  cashier: Cashier;
};

const REFRESH_INTERVAL_SECONDS = 45;
const REFRESH_CAP = 3;

// ---------------------------------------------------------------------------
// Error code → Spanish message mapping
// ---------------------------------------------------------------------------
const linkErrorMessage = (error: unknown): string => {
  if (isAxiosError<{ error?: string; message?: string }>(error)) {
    const code = error.response?.data?.error;
    const msg = error.response?.data?.message;
    if (code === 'SESSION_NOT_FOUND') return 'Sesión no encontrada';
    if (code === 'WAHA_SESSION_NOT_READY') return msg ?? 'La sesión de WhatsApp está iniciando. Intentá de nuevo en unos segundos.';
    if (code === 'WAHA_AUTH_ARTIFACTS_UNAVAILABLE') return msg ?? 'No se pudo generar el QR o código. Intentá de nuevo.';
    if (code === 'WAHA_SESSION_FAILED') return msg ?? 'La sesión de WhatsApp falló al iniciar. Intentá de nuevo.';
    if (msg) return msg;
  }
  return 'No se pudo iniciar el flujo de WhatsApp';
};

// ---------------------------------------------------------------------------
// QR Dialog — per-session "Generar QR ahora" flow
// ---------------------------------------------------------------------------

interface QrDialogProps {
  session: WhatsappSession;
  cashierId: string;
  open: boolean;
  onClose: () => void;
}

const QrDialog = ({ session, cashierId, open, onClose }: QrDialogProps) => {
  const [phoneNumber, setPhoneNumber] = useState(
    localPhonePart(session.whatsappPhoneNumber ?? ''),
  );
  const [artifacts, setArtifacts] = useState<WhatsappLinkArtifacts | null>(null);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL_SECONDS);
  const [reachedQr, setReachedQr] = useState(false);
  const timerRef = useRef<number | null>(null);

  const linkSession = useLinkAdminCashierSession(cashierId);

  // Human-readable title: alias › phone › fallback
  const displayName = session.alias?.trim()
    ? session.alias.trim()
    : session.whatsappPhoneNumber
      ? `+${session.whatsappPhoneNumber}`
      : 'Sin número vinculado';

  const stopTimer = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // Reset state when dialog opens for a fresh session
  useEffect(() => {
    if (open) {
      setPhoneNumber(localPhonePart(session.whatsappPhoneNumber ?? ''));
      setArtifacts(null);
      setCountdown(REFRESH_INTERVAL_SECONDS);
      setReachedQr(false);
      stopTimer();
    }
    return () => {
      stopTimer();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, session.id]);

  // Once connected, stop refreshing — relinking a WORKING session would break
  // the active connection. The dialog stays open showing the connected state
  // (same as the cashier view); the admin closes it manually.
  useEffect(() => {
    if (session.wahaStatus === 'WORKING') stopTimer();
  }, [session.wahaStatus]);

  // Track whether the QR was reached, so a later STARTING reads as "connecting
  // after the scan" (step 2) instead of the initial "booting" step (step 0).
  useEffect(() => {
    if (session.wahaStatus === 'SCAN_QR_CODE' || artifacts?.qr) {
      setReachedQr(true);
    }
  }, [session.wahaStatus, artifacts?.qr]);

  const applyArtifacts = useCallback((data: WhatsappLinkArtifacts) => {
    const normalizedQr =
      data.qr && !data.qr.startsWith('data:')
        ? `data:image/png;base64,${data.qr}`
        : data.qr;
    setArtifacts({ ...data, qr: normalizedQr });
    setCountdown(REFRESH_INTERVAL_SECONDS);
  }, []);

  const handleAutoRefresh = useCallback(async () => {
    if (!localPhonePart(phoneNumber)) return;
    try {
      const data = await linkSession.mutateAsync({ sessionId: session.id, phoneNumber: toArgentinePhone(phoneNumber) });
      applyArtifacts(data);
    } catch {
      stopTimer();
      toast.error('Se alcanzó el límite de refrescos automáticos');
    }
  }, [linkSession, session.id, phoneNumber, applyArtifacts]);

  const startTimer = useCallback(() => {
    stopTimer();
    timerRef.current = window.setInterval(() => {
      setCountdown((current) => {
        if (current <= 1) {
          void handleAutoRefresh();
          return REFRESH_INTERVAL_SECONDS;
        }
        return current - 1;
      });
    }, 1000);
  }, [handleAutoRefresh]);

  const handleGenerate = async () => {
    if (!localPhonePart(phoneNumber)) {
      toast.error('Ingresá un número de teléfono');
      return;
    }
    try {
      const data = await linkSession.mutateAsync({ sessionId: session.id, phoneNumber: toArgentinePhone(phoneNumber) });
      applyArtifacts(data);
      if (data.refreshCount < REFRESH_CAP) {
        startTimer();
      }
      toast.success('QR y código generados correctamente');
    } catch (error) {
      toast.error(linkErrorMessage(error));
    }
  };

  const handleManualReload = async () => {
    stopTimer();
    await handleGenerate();
  };

  const handleClose = () => {
    stopTimer();
    onClose();
  };

  const refreshCount = artifacts?.refreshCount ?? session.refreshCount;
  const reachedCap = refreshCount >= REFRESH_CAP;
  const qrSrc = artifacts?.qr ?? null;
  const pairingCode = artifacts?.pairingCode ?? null;
  const hasArtifacts = !!(qrSrc || pairingCode);

  const wahaStatus = session.wahaStatus ?? 'STOPPED';
  const isWorking = wahaStatus === 'WORKING';
  const needsQr = wahaStatus === 'SCAN_QR_CODE';
  const isStarting = wahaStatus === 'STARTING';
  const isFailed = wahaStatus === 'FAILED';
  const inLinkFlow = isStarting || needsQr || isWorking;
  const linkStep = computeLinkStep(wahaStatus, reachedQr);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          {/* pr-8 reserves space so the badge doesn't collide with the dialog close button */}
          <DialogTitle className='flex items-center gap-2 pr-8'>
            <span className='min-w-0 flex-1 truncate'>{displayName}</span>
            <SessionStatusBadge status={session.wahaStatus ?? 'STOPPED'} className='shrink-0' />
          </DialogTitle>
          <DialogDescription>
            Iniciá el flujo de vinculación de WhatsApp para esta sesión.
            El cajero podrá escanear el QR o ingresar el código de vinculación.
          </DialogDescription>
        </DialogHeader>

        <div className='flex flex-col gap-4'>
          {inLinkFlow && (
            <div className='rounded-xl glass-subtle p-3'>
              <SessionLinkStepper currentStep={linkStep} failed={isFailed} />
            </div>
          )}

          {isWorking ? (
            <div className='flex items-center gap-3 rounded-xl glass-subtle p-3'>
              <StatusRingAvatar status={wahaStatus} size='md' className='shrink-0' />
              <div className='min-w-0 flex-1'>
                <p className='text-sm font-medium leading-tight'>Conectado a WhatsApp</p>
                {session.whatsappPhoneNumber && (
                  <p className='truncate font-mono text-xs text-muted-foreground'>
                    +{session.whatsappPhoneNumber}
                  </p>
                )}
              </div>
            </div>
          ) : isStarting ? (
            <LinkLoaderPanel
              title={
                linkStep === 2
                  ? 'Conectando con WhatsApp…'
                  : 'Preparando la sesión…'
              }
              hint={
                linkStep === 2
                  ? 'Ya casi: no cierres esta ventana'
                  : 'Estamos generando el código QR'
              }
            />
          ) : (
            <>
              {/* Setup form — only before the QR is up; the scan view stays
                  compact (just the stepper, the code and the QR). */}
              {!needsQr && (
                <>
                  <div className='rounded-xl border border-dashed p-3'>
                    <p className='mb-2 text-xs font-medium text-muted-foreground'>
                      Cómo vincular WhatsApp:
                    </p>
                    <ol className='flex list-none flex-col gap-1 text-xs text-muted-foreground'>
                      <li>1. Abrí WhatsApp en el celular del cajero</li>
                      <li>2. Tocá <strong>Dispositivos vinculados</strong> › <strong>Vincular dispositivo</strong></li>
                      <li>3. Escaneá el QR o ingresá el código de vinculación de abajo</li>
                    </ol>
                  </div>

                  <div className='flex flex-col gap-2 rounded-lg border p-3'>
                    <p className='text-sm font-medium'>Número de teléfono</p>
                    <div className='flex items-center gap-2'>
                      <span className='shrink-0 rounded-md border bg-muted/40 px-2.5 py-2 font-mono text-sm text-muted-foreground'>
                        +549
                      </span>
                      <Input
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        placeholder='Ej: 1123456789'
                        disabled={linkSession.isPending}
                        inputMode='numeric'
                      />
                    </div>
                    <p className='text-xs text-muted-foreground'>
                      El prefijo 549 se agrega automáticamente.
                    </p>
                  </div>
                </>
              )}

              {pairingCode && (
                <div className='flex flex-col gap-1 rounded-lg border p-3'>
                  <p className='text-sm font-medium'>Código de vinculación</p>
                  <p className='text-lg tracking-wide text-primary'>{pairingCode}</p>
                </div>
              )}

              {(qrSrc || needsQr) && (
                <div className='flex flex-col items-center gap-2 rounded-lg border p-3'>
                  <p className='text-sm font-medium self-start'>Escaneá este código</p>
                  {qrSrc ? (
                    <img
                      src={qrSrc}
                      alt='QR WhatsApp'
                      className='h-56 w-56 rounded-md border object-contain'
                    />
                  ) : (
                    <Skeleton className='h-56 w-56 rounded-md' />
                  )}
                </div>
              )}

              {isFailed && (
                <div className='flex flex-col items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-center'>
                  <TriangleAlertIcon className='size-6 text-destructive' />
                  <p className='text-sm font-medium text-destructive'>
                    No se pudo conectar
                  </p>
                  <p className='text-xs text-muted-foreground'>
                    Volvé a generar el QR e intentá de nuevo.
                  </p>
                </div>
              )}

              {hasArtifacts && (
                <p className='text-xs text-muted-foreground'>
                  {reachedCap
                    ? 'Límite de refrescos alcanzado. Presioná "Volver a cargar" para reiniciar.'
                    : `Próximo refresco automático en ${countdown}s`}
                </p>
              )}

              {(!needsQr || hasArtifacts) && (
                <div className='flex flex-wrap gap-2'>
                  {!needsQr && (
                    <Button
                      size='sm'
                      onClick={handleGenerate}
                      disabled={linkSession.isPending}
                    >
                      <QrCodeIcon className='size-4' />
                      {linkSession.isPending ? 'Generando...' : 'Generar QR'}
                    </Button>
                  )}

                  {hasArtifacts && (
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={handleManualReload}
                      disabled={linkSession.isPending}
                    >
                      Volver a cargar
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={handleClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export const AdminCashierSessionsPanel = ({ cashier }: Props) => {
  const [qrSessionId, setQrSessionId] = useState<string | null>(null);
  // Poll the session list fast while a link dialog is open so its stepper
  // reflects the live WAHA status (STARTING -> SCAN_QR_CODE -> WORKING).
  const { data: sessions = [], isLoading } = useCashierSessions(cashier.id, {
    fast: Boolean(qrSessionId),
  });
  const createSession = useCreateCashierSession(cashier.id);
  const deleteSession = useDeleteCashierSession(cashier.id);
  const updateMaxSessions = useUpdateCashierMaxSessions();
  // Admin alias scope requires the real cashierId (unlike cashier scope which uses '')
  const setAlias = useSetSessionAlias({ kind: 'admin', cashierId: cashier.id });

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingAliasId, setEditingAliasId] = useState<string | null>(null);

  // created-count vs cap — same comparison as the create-button guard
  const atCap = sessions.length >= cashier.maxSessions;

  const handleCreate = async () => {
    try {
      await createSession.mutateAsync();
      toast.success('Sesión creada correctamente');
    } catch {
      toast.error('No se pudo crear la sesión (límite alcanzado o error)');
    }
  };

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    try {
      await deleteSession.mutateAsync(confirmDeleteId);
      toast.success('Sesión eliminada');
      setConfirmDeleteId(null);
    } catch {
      toast.error('No se pudo eliminar la sesión');
    }
  };

  const handleMaxSessionsChange = async (value: number) => {
    try {
      await updateMaxSessions.mutateAsync({ cashierId: cashier.id, input: { maxSessions: value } });
    } catch {
      toast.error('No se pudo actualizar el límite');
    }
  };

  const activeQrSession = qrSessionId
    ? sessions.find((s) => s.id === qrSessionId) ?? null
    : null;

  return (
    <div className='flex w-full min-w-0 flex-col gap-4'>
      {/* Header: capacity meter + stepper + Nueva sesión button */}
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex flex-wrap items-center gap-4'>
          <CapacityMeter
            used={sessions.length}
            total={cashier.maxSessions}
            label={`${sessions.length} de ${cashier.maxSessions} sesiones`}
          />
          <MaxSessionsStepper
            value={cashier.maxSessions}
            min={sessions.length}
            onChange={handleMaxSessionsChange}
            isPending={updateMaxSessions.isPending}
            label='Máximo'
          />
        </div>
        <Button
          size='sm'
          onClick={handleCreate}
          disabled={atCap || createSession.isPending}
          aria-label='Crear nueva sesión de WhatsApp'
        >
          <PlusIcon className='size-4' />
          {createSession.isPending ? 'Creando...' : 'Nueva sesión'}
        </Button>
      </div>

      {/* Session cards */}
      {isLoading ? (
        <div className='flex flex-col gap-2'>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className='h-16 w-full rounded-xl' />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <div className='flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground'>
          <SmartphoneIcon className='size-8 opacity-40' />
          <p>Este cajero no tiene sesiones todavía. Creá una para empezar.</p>
        </div>
      ) : (
        <ul className='flex max-h-[420px] flex-col gap-2 overflow-y-auto scrollbar-thin pr-1'>
          {sessions.map((session) => {
            const isWorking = session.wahaStatus === 'WORKING';
            const aliasName = session.alias?.trim();
            const phone = session.whatsappPhoneNumber;

            // subtitle: shows phone when alias is the title, omitted otherwise to avoid repetition
            const subtitle = aliasName
              ? (phone ? `+${phone}` : 'Sin número vinculado')
              : undefined;

            // placeholder for InlineRename when no alias is set
            const renamePlaceholder = phone ? `+${phone}` : 'Sin número vinculado';

            return (
              <li key={session.id}>
                {/*
                  No onClick — admin rows have inline action buttons.
                  Passing onClick AND interactive actions would nest buttons.
                */}
                <SessionLineCard
                  status={session.wahaStatus ?? 'STOPPED'}
                  editing={editingAliasId === session.id}
                  title={
                    <InlineRename
                      value={session.alias}
                      placeholder={renamePlaceholder}
                      onSave={(value) =>
                        setAlias.mutateAsync({ sessionId: session.id, alias: value || null })
                      }
                      isPending={setAlias.isPending}
                      ariaLabel={aliasName ? `Renombrar: ${aliasName}` : 'Asignar nombre a la sesión'}
                      isEditing={editingAliasId === session.id}
                      onEditingChange={(e) => setEditingAliasId(e ? session.id : null)}
                      className='w-full'
                    />
                  }
                  subtitle={subtitle}
                  actions={
                    <>
                      {isWorking ? (
                        <Button
                          variant='ghost'
                          size='sm'
                          disabled
                          className='h-8 w-8 p-0'
                          aria-label='Ya conectado'
                        >
                          <QrCodeIcon className='size-4' />
                        </Button>
                      ) : (
                        <Button
                          variant='ghost'
                          size='sm'
                          className='h-8 w-8 p-0'
                          onClick={() => setQrSessionId(session.id)}
                          aria-label='Generar QR para vincular WhatsApp'
                        >
                          <QrCodeIcon className='size-4' />
                        </Button>
                      )}
                      <Button
                        variant='ghost'
                        size='sm'
                        className='h-8 w-8 p-0 text-destructive hover:text-destructive'
                        onClick={() => setConfirmDeleteId(session.id)}
                        disabled={deleteSession.isPending}
                        aria-label='Eliminar sesión'
                      >
                        <Trash2Icon className='size-4' />
                      </Button>
                    </>
                  }
                />
              </li>
            );
          })}
        </ul>
      )}

      {/* Confirm delete dialog */}
      <Dialog
        open={Boolean(confirmDeleteId)}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteId(null);
        }}
      >
        <DialogContent className="bg-popover!">
          <DialogHeader>
            <DialogTitle>Eliminar sesión</DialogTitle>
            <DialogDescription>
              Se eliminará esta sesión de WhatsApp y se desvincularán sus landings. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant='outline' onClick={() => setConfirmDeleteId(null)}>
              Cancelar
            </Button>
            <Button
              variant='destructive'
              onClick={handleDelete}
              disabled={deleteSession.isPending}
            >
              {deleteSession.isPending ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR generation dialog */}
      {activeQrSession && (
        <QrDialog
          key={activeQrSession.id}
          session={activeQrSession}
          cashierId={cashier.id}
          open={Boolean(qrSessionId)}
          onClose={() => setQrSessionId(null)}
        />
      )}
    </div>
  );
};
