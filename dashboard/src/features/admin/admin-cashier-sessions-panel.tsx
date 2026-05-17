import { useCallback, useEffect, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import { CheckIcon, PencilIcon, PlusIcon, QrCodeIcon, SmartphoneIcon, Trash2Icon, XIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatDateTime } from '@/lib/format';
import { wahaStatusLabel, wahaStatusVariant } from '@/lib/waha-status';
import {
  useCashierSessions,
  useCreateCashierSession,
  useDeleteCashierSession,
  useLinkAdminCashierSession,
  useUpdateCashierMaxSessions,
} from '@/features/admin/admin-hooks';
import type { Cashier, WhatsappLinkArtifacts, WhatsappSession } from '@/types/domain';

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
    if (code === 'SESSION_NOT_FOUND') return 'Sesion no encontrada';
    if (code === 'WAHA_SESSION_NOT_READY') return msg ?? 'La sesion de WhatsApp está iniciando. Intenta de nuevo en unos segundos.';
    if (code === 'WAHA_AUTH_ARTIFACTS_UNAVAILABLE') return msg ?? 'No se pudo generar el QR o codigo. Intenta de nuevo.';
    if (code === 'WAHA_SESSION_FAILED') return msg ?? 'La sesion de WhatsApp fallo al iniciar. Intenta de nuevo.';
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
    } catch (error) {
      stopTimer();
      toast.error('Se alcanzo el limite de refrescos automaticos');
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
      toast.error('Ingresa un numero de telefono');
      return;
    }
    try {
      const data = await linkSession.mutateAsync({ sessionId: session.id, phoneNumber: phoneNumber.trim() });
      applyArtifacts(data);
      if (data.refreshCount < REFRESH_CAP) {
        startTimer();
      }
      toast.success('QR y codigo generados correctamente');
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
          <DialogTitle>Generar QR — WhatsApp</DialogTitle>
          <DialogDescription>
            Inicia el flujo de vinculacion de WhatsApp para esta sesion.
            El cajero podra escanear el QR o ingresar el codigo de vinculacion.
          </DialogDescription>
        </DialogHeader>

        <div className='flex flex-col gap-4'>
          <div className='flex flex-wrap gap-2 text-xs text-muted-foreground'>
            <span>Sesion: <span className='font-mono'>{session.sessionName}</span></span>
            <span>Intentos: {refreshCount}/{REFRESH_CAP}</span>
          </div>

          <div className='flex flex-col gap-2 rounded-lg border p-3'>
            <p className='text-sm font-medium'>Numero de telefono</p>
            <Input
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder='Ej: 5491112345678'
              disabled={linkSession.isPending}
            />
          </div>

          {pairingCode && (
            <div className='flex flex-col gap-1 rounded-lg border p-3'>
              <p className='text-sm font-medium'>Codigo de vinculacion</p>
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
                ? 'Limite de refrescos alcanzado. Presiona "Volver a cargar" para reiniciar.'
                : `Proximo refresco automatico en ${countdown}s`}
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
// Inline maxSessions editor
// ---------------------------------------------------------------------------

interface MaxSessionsEditorProps {
  cashierId: string;
  maxSessions: number;
  currentCount: number;
}

const MaxSessionsEditor = ({ cashierId, maxSessions, currentCount }: MaxSessionsEditorProps) => {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(maxSessions));
  const updateMaxSessions = useUpdateCashierMaxSessions();

  const handleOpen = () => {
    setValue(String(maxSessions));
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
  };

  const handleSave = async () => {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed < 1) {
      toast.error('El maximo debe ser al menos 1');
      return;
    }
    try {
      await updateMaxSessions.mutateAsync({ cashierId, input: { maxSessions: parsed } });
      toast.success('Limite actualizado');
      setEditing(false);
    } catch (error) {
      if (isAxiosError<{ error?: string; message?: string }>(error)) {
        const code = error.response?.data?.error;
        const msg = error.response?.data?.message;
        if (code === 'MAX_SESSIONS_BELOW_CURRENT' && msg) {
          toast.error(msg);
          return;
        }
      }
      toast.error('No se pudo actualizar el limite');
    }
  };

  const newCapBelowCount = !isNaN(parseInt(value, 10)) && parseInt(value, 10) < currentCount;

  if (!editing) {
    return (
      <Button
        type='button'
        size='sm'
        variant='outline'
        onClick={handleOpen}
        className='h-7 gap-1.5 px-2 text-xs'
        title='Editar límite de sesiones'
      >
        <PencilIcon className='size-3' />
        Máx: {maxSessions}
      </Button>
    );
  }

  return (
    <div className='flex flex-col gap-1'>
      <div className='flex items-center gap-1'>
        <Input
          type='number'
          min={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className='h-7 w-16 text-xs'
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleSave();
            if (e.key === 'Escape') handleCancel();
          }}
        />
        <Button
          size='sm'
          variant='ghost'
          className='h-7 w-7 p-0'
          onClick={() => void handleSave()}
          disabled={updateMaxSessions.isPending}
          title='Guardar'
        >
          <CheckIcon className='size-3.5' />
        </Button>
        <Button
          size='sm'
          variant='ghost'
          className='h-7 w-7 p-0'
          onClick={handleCancel}
          title='Cancelar'
        >
          <XIcon className='size-3.5' />
        </Button>
      </div>
      {newCapBelowCount && (
        <p className='text-xs text-amber-600'>
          Tenés {currentCount} sesion{currentCount !== 1 ? 'es' : ''} creada{currentCount !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export const AdminCashierSessionsPanel = ({ cashier }: Props) => {
  const { data: sessions = [], isLoading } = useCashierSessions(cashier.id);
  const createSession = useCreateCashierSession(cashier.id);
  const deleteSession = useDeleteCashierSession(cashier.id);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [qrSessionId, setQrSessionId] = useState<string | null>(null);

  const atCap = sessions.length >= cashier.maxSessions;

  const handleCreate = async () => {
    try {
      await createSession.mutateAsync();
      toast.success('Sesion creada correctamente');
    } catch {
      toast.error('No se pudo crear la sesion (limite alcanzado o error)');
    }
  };

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    try {
      await deleteSession.mutateAsync(confirmDeleteId);
      toast.success('Sesion eliminada');
      setConfirmDeleteId(null);
    } catch {
      toast.error('No se pudo eliminar la sesion');
    }
  };

  const activeQrSession = qrSessionId
    ? sessions.find((s) => s.id === qrSessionId) ?? null
    : null;

  return (
    <div className='flex w-full min-w-0 flex-col gap-4'>
      {/* Header: count badge + maxSessions editor + Nueva sesion button */}
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex flex-wrap items-center gap-2'>
          <Badge variant='outline' className='text-xs'>
            {sessions.length} sesion{sessions.length !== 1 ? 'es' : ''}
          </Badge>
          <MaxSessionsEditor
            cashierId={cashier.id}
            maxSessions={cashier.maxSessions}
            currentCount={sessions.length}
          />
          {atCap && (
            <Badge variant='outline' className='text-xs'>
              Limite alcanzado
            </Badge>
          )}
        </div>
        <Button
          size='sm'
          onClick={handleCreate}
          disabled={atCap || createSession.isPending}
        >
          <PlusIcon className='size-4' />
          {createSession.isPending ? 'Creando...' : 'Nueva sesion'}
        </Button>
      </div>

      {/* Session cards */}
      {isLoading ? (
        <p className='text-sm text-muted-foreground'>Cargando sesiones...</p>
      ) : sessions.length === 0 ? (
        <div className='flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground'>
          <SmartphoneIcon className='size-8 opacity-40' />
          <p>Este cajero no tiene sesiones todavia. Creá una para empezar.</p>
        </div>
      ) : (
        <ul className='flex flex-col gap-2'>
          {sessions.map((session) => {
            const isWorking = session.wahaStatus === 'WORKING';
            const title = session.whatsappPhoneNumber ?? 'Sin numero vinculado';
            const metaParts: string[] = [];
            if (session.whatsappPhoneNumber) {
              metaParts.push(`Intentos ${session.refreshCount}/3`);
              if (session.lastRefreshAt) {
                metaParts.push(`Ultimo ${formatDateTime(session.lastRefreshAt)}`);
              }
            } else {
              metaParts.push('Tocar QR para vincular');
            }
            return (
              <li key={session.id}>
                <div className='flex min-w-0 items-center gap-3 rounded-lg border bg-card p-3'>
                  <div className='flex size-10 shrink-0 items-center justify-center rounded-full bg-muted'>
                    <SmartphoneIcon className='size-5 text-muted-foreground' />
                  </div>
                  <div className='flex min-w-0 flex-1 flex-col gap-1'>
                    <p className='truncate text-sm font-medium'>{title}</p>
                    <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
                      <Badge variant={wahaStatusVariant(session.wahaStatus)}>
                        {wahaStatusLabel(session.wahaStatus)}
                      </Badge>
                      <span className='truncate text-xs text-muted-foreground'>
                        {metaParts.join(' · ')}
                      </span>
                    </div>
                  </div>
                  <div className='flex shrink-0 items-center gap-1'>
                    {isWorking ? (
                      <Button
                        variant='ghost'
                        size='sm'
                        disabled
                        className='h-8 w-8 p-0 opacity-40'
                        title='Ya conectado'
                      >
                        <QrCodeIcon className='size-4' />
                      </Button>
                    ) : (
                      <Button
                        variant='ghost'
                        size='sm'
                        className='h-8 w-8 p-0'
                        onClick={() => setQrSessionId(session.id)}
                        title='Generar QR'
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
                      title='Eliminar sesion'
                    >
                      <Trash2Icon className='size-4' />
                    </Button>
                  </div>
                </div>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar sesion</DialogTitle>
            <DialogDescription>
              Se eliminara la sesion de WAHA y todos sus bindings con landings. Esta accion no se puede deshacer.
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
