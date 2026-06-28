import { useCallback, useEffect, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import { PlusIcon, QrCodeIcon, SmartphoneIcon, Trash2Icon } from 'lucide-react';
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
  const [phoneNumber, setPhoneNumber] = useState(session.whatsappPhoneNumber ?? '');
  const [artifacts, setArtifacts] = useState<WhatsappLinkArtifacts | null>(null);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL_SECONDS);
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
      setPhoneNumber(session.whatsappPhoneNumber ?? '');
      setArtifacts(null);
      setCountdown(REFRESH_INTERVAL_SECONDS);
      stopTimer();
    }
    return () => {
      stopTimer();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, session.id]);

  // Auto-close when the session becomes WORKING while the dialog is open.
  // Continuing to refresh the QR / pairing code against an already-linked
  // session can attempt to relink and break the active connection.
  useEffect(() => {
    if (!open) return;
    if (session.wahaStatus !== 'WORKING') return;
    stopTimer();
    toast.success('WhatsApp conectado correctamente');
    onClose();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, session.wahaStatus]);

  const applyArtifacts = useCallback((data: WhatsappLinkArtifacts) => {
    const normalizedQr =
      data.qr && !data.qr.startsWith('data:')
        ? `data:image/png;base64,${data.qr}`
        : data.qr;
    setArtifacts({ ...data, qr: normalizedQr });
    setCountdown(REFRESH_INTERVAL_SECONDS);
  }, []);

  const handleAutoRefresh = useCallback(async () => {
    if (!phoneNumber.trim()) return;
    try {
      const data = await linkSession.mutateAsync({ sessionId: session.id, phoneNumber: phoneNumber.trim() });
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
    if (!phoneNumber.trim()) {
      toast.error('Ingresá un número de teléfono');
      return;
    }
    try {
      const data = await linkSession.mutateAsync({ sessionId: session.id, phoneNumber: phoneNumber.trim() });
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
          {/* Step-by-step linking instructions */}
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
            <Input
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder='Ej: 5491112345678'
              disabled={linkSession.isPending}
            />
          </div>

          {pairingCode && (
            <div className='flex flex-col gap-1 rounded-lg border p-3'>
              <p className='text-sm font-medium'>Código de vinculación</p>
              <p className='text-lg tracking-wide text-primary'>{pairingCode}</p>
            </div>
          )}

          {qrSrc && (
            <div className='flex flex-col items-center gap-2 rounded-lg border p-3'>
              <p className='text-sm font-medium self-start'>QR WhatsApp</p>
              <img
                src={qrSrc}
                alt='QR WhatsApp'
                className='h-56 w-56 rounded-md border object-contain'
              />
            </div>
          )}

          {hasArtifacts && (
            <p className='text-xs text-muted-foreground'>
              {reachedCap
                ? 'Límite de refrescos alcanzado. Presioná "Volver a cargar" para reiniciar.'
                : `Próximo refresco automático en ${countdown}s`}
            </p>
          )}

          <div className='flex flex-wrap gap-2'>
            <Button
              size='sm'
              onClick={handleGenerate}
              disabled={linkSession.isPending}
            >
              <QrCodeIcon className='size-4' />
              {linkSession.isPending ? 'Generando...' : 'Generar QR'}
            </Button>

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
  const { data: sessions = [], isLoading } = useCashierSessions(cashier.id);
  const createSession = useCreateCashierSession(cashier.id);
  const deleteSession = useDeleteCashierSession(cashier.id);
  const updateMaxSessions = useUpdateCashierMaxSessions();
  // Admin alias scope requires the real cashierId (unlike cashier scope which uses '')
  const setAlias = useSetSessionAlias({ kind: 'admin', cashierId: cashier.id });

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [qrSessionId, setQrSessionId] = useState<string | null>(null);
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
