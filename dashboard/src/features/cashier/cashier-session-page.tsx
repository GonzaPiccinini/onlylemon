import { useCallback, useEffect, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import {
  ChevronRightIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  LoaderIcon,
  PlayIcon,
  QrCodeIcon,
  RefreshCcwIcon,
  SmartphoneIcon,
  SquareIcon,
  PlusIcon,
  Trash2Icon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/common/status-badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateTime, formatDuration } from '@/lib/format';
import {
  useCashierRuntimeState,
  useCashierSessions,
  useCreateMySession,
  useCurrentSession,
  useDeleteMySession,
  useFinishSession,
  useLinkMySession,
  useMySessions,
  useMySessionStatus,
  useRefreshMySession,
  useResetMySessionRefresh,
  useStartSession,
} from '@/features/cashier/cashier-hooks';
import { PaginationControls } from '@/components/common/pagination-controls';
import { TableRowsSkeleton } from '@/components/common/table-skeleton';
import { SessionLineCard } from '@/components/common/session-line-card';
import { CapacityMeter } from '@/components/common/capacity-meter';
import { SessionStatusBadge } from '@/components/common/session-status-badge';
import { InlineRename } from '@/components/common/inline-rename';
import { StatusRingAvatar } from '@/components/common/status-ring-avatar';
import { SessionLinkStepper } from '@/features/cashier/session-link-stepper';
import { useSetSessionAlias } from '@/features/chat/hooks/useSetSessionAlias';
import { localPhonePart, toArgentinePhone } from '@/lib/phone';
import type { MyWhatsappSession } from '@/types/domain';

const REFRESH_INTERVAL_SECONDS = 45;

/** Centered spinner panel used for the booting and connecting link steps. */
const LinkLoaderPanel = ({ title, hint }: { title: string; hint?: string }) => (
  <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center">
    <LoaderIcon className="size-7 animate-spin text-primary" />
    <p className="text-sm font-medium">{title}</p>
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
  </div>
);

// ---------------------------------------------------------------------------
// Session modal (per-session QR/pairing/status/refresh/delete)
// ---------------------------------------------------------------------------

interface SessionModalProps {
  session: MyWhatsappSession;
  onClose: () => void;
}

const SessionModal = ({ session, onClose }: SessionModalProps) => {
  const [phoneNumber, setPhoneNumber] = useState(
    localPhonePart(session.whatsappPhoneNumber ?? ''),
  );
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [qrValue, setQrValue] = useState<string | null>(null);
  const [refreshCount, setRefreshCount] = useState(session.refreshCount);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL_SECONDS);
  const timerRef = useRef<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // Tracks whether the QR was ever reached, so a later STARTING reads as
  // "connecting after the scan" instead of the initial "booting" step.
  const [reachedQr, setReachedQr] = useState(false);

  const REFRESH_CAP = 3;

  const { data: liveStatus } = useMySessionStatus(session.id, true);
  const linkSession = useLinkMySession();
  const refreshSession = useRefreshMySession();
  const resetRefresh = useResetMySessionRefresh();
  const deleteSession = useDeleteMySession();
  const setAlias = useSetSessionAlias({ kind: 'cashier', cashierId: '' });

  const stopTimer = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const applyArtifacts = useCallback(
    (artifacts: {
      pairingCode: string | null;
      qr: string | null;
      refreshCount: number;
    }) => {
      const normalizedQr =
        artifacts.qr && !artifacts.qr.startsWith('data:')
          ? `data:image/png;base64,${artifacts.qr}`
          : artifacts.qr;

      setPairingCode((current) => artifacts.pairingCode ?? current);
      setQrValue((current) => normalizedQr ?? current);
      setRefreshCount(artifacts.refreshCount);
      setCountdown(REFRESH_INTERVAL_SECONDS);
    },
    [],
  );

  const handleAutoRefresh = useCallback(async () => {
    try {
      const data = await refreshSession.mutateAsync(session.id);
      applyArtifacts(data);
    } catch {
      stopTimer();
      toast.error('Se alcanzo el limite de refrescos automaticos');
    }
  }, [refreshSession, session.id, applyArtifacts]);

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

  // Stop timer when modal closes
  useEffect(() => {
    return () => {
      stopTimer();
    };
  }, []);

  const handleStartLink = async () => {
    if (!localPhonePart(phoneNumber)) {
      toast.error('Ingresa un numero de telefono');
      return;
    }

    try {
      const data = await linkSession.mutateAsync({
        sessionId: session.id,
        phoneNumber: toArgentinePhone(phoneNumber),
      });
      applyArtifacts(data);
      startTimer();
      toast.success('QR y codigo cargados');
    } catch (error) {
      const apiMessage = isAxiosError<{ message?: string; error?: string }>(
        error,
      )
        ? (error.response?.data?.message ?? error.response?.data?.error)
        : null;
      toast.error(
        apiMessage ?? 'No se pudieron solicitar credenciales de WhatsApp',
      );
    }
  };

  const handleManualReset = async () => {
    try {
      await resetRefresh.mutateAsync(session.id);
      toast.success('Refrescos reiniciados');
      await handleStartLink();
    } catch {
      toast.error('No se pudieron reiniciar los refrescos');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteSession.mutateAsync(session.id);
      toast.success('Sesion eliminada');
      onClose();
    } catch {
      toast.error('No se pudo eliminar la sesion');
    }
  };

  const reachedAutoLimit = refreshCount >= REFRESH_CAP;
  const wahaStatus = liveStatus?.status ?? session.wahaStatus;
  const isWorking = wahaStatus === 'WORKING';
  const needsQr = wahaStatus === 'SCAN_QR_CODE';
  const isFailed = wahaStatus === 'FAILED';
  const isStarting = wahaStatus === 'STARTING';
  // The link flow is "active" once a session is booting/scanning/connected.
  const inLinkFlow = isStarting || needsQr || isWorking;

  // Step index for the stepper, derived from the real WAHA status:
  // 0 booting (STARTING, no QR yet) · 1 scan (SCAN_QR_CODE) ·
  // 2 connecting (STARTING after the QR was shown) · 3 connected (WORKING).
  const linkStep = isWorking
    ? 3
    : needsQr
      ? 1
      : isStarting
        ? reachedQr
          ? 2
          : 0
        : 0;

  // Mark progress once the QR is reachable; stop the auto-refresh timer once
  // the session is connected so it doesn't keep polling for a new QR.
  useEffect(() => {
    if (needsQr || qrValue) setReachedQr(true);
  }, [needsQr, qrValue]);

  useEffect(() => {
    if (isWorking) stopTimer();
  }, [isWorking]);

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 pr-8">
          <InlineRename
            value={session.alias ?? ''}
            placeholder="Poner un nombre"
            onSave={(value) =>
              setAlias.mutateAsync({ sessionId: session.id, alias: value || null })
            }
            isPending={setAlias.isPending}
            className="min-w-0 flex-1"
          />
          <SessionStatusBadge status={wahaStatus} className="shrink-0" />
        </DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        {inLinkFlow && (
          <div className="rounded-xl glass-subtle p-3">
            <SessionLinkStepper currentStep={linkStep} failed={isFailed} />
          </div>
        )}
        {isWorking ? (
          <div className="flex items-center gap-3 rounded-xl glass-subtle p-3">
            <StatusRingAvatar status={wahaStatus} size="md" className="shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-tight">Conectado a WhatsApp</p>
              {session.whatsappPhoneNumber && (
                <p className="truncate font-mono text-xs text-muted-foreground">
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
                : 'Preparando tu sesión…'
            }
            hint={
              linkStep === 2
                ? 'Ya casi: no cierres esta ventana'
                : 'Estamos generando tu código QR'
            }
          />
        ) : (
          <>
            {/* Setup form — only before the QR is up. Once scanning, the modal
                stays compact: just the stepper, the code and the QR. */}
            {!needsQr && (
              <>
                <div className="rounded-xl border border-dashed p-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    Cómo vincular tu WhatsApp:
                  </p>
                  <ol className="flex list-none flex-col gap-1 text-xs text-muted-foreground">
                    <li>1. Abrí WhatsApp en tu celular</li>
                    <li>2. Tocá <strong>Dispositivos vinculados</strong> › <strong>Vincular dispositivo</strong></li>
                    <li>3. Escaneá el código QR o ingresá el código de vinculación</li>
                  </ol>
                </div>

                <div className="flex flex-col gap-2 rounded-lg border p-3">
                  <p className="text-sm font-medium">Numero de telefono</p>
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 rounded-md border bg-muted/40 px-2.5 py-2 font-mono text-sm text-muted-foreground">
                      +549
                    </span>
                    <Input
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="Ej: 1123456789"
                      disabled={linkSession.isPending}
                      inputMode="numeric"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    El prefijo 549 se agrega automáticamente.
                  </p>
                </div>
              </>
            )}

            {pairingCode && (
              <div className="flex flex-col gap-1 rounded-lg border p-3">
                <p className="text-sm font-medium">Codigo de vinculacion</p>
                <p className="text-lg tracking-wide text-primary">
                  {pairingCode}
                </p>
              </div>
            )}

            {(qrValue || needsQr) && (
              <div className="flex flex-col items-center gap-2 rounded-lg border p-3">
                <p className="self-start text-sm font-medium">Escaneá este código</p>
                {qrValue ? (
                  <img
                    src={qrValue}
                    alt="QR WhatsApp"
                    className="h-48 w-48 rounded-md border object-contain"
                  />
                ) : (
                  <Skeleton className="h-48 w-48 rounded-md" />
                )}
              </div>
            )}

            {isFailed && (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-center">
                <TriangleAlertIcon className="size-6 text-destructive" />
                <p className="text-sm font-medium text-destructive">
                  No se pudo conectar
                </p>
                <p className="text-xs text-muted-foreground">
                  Volvé a generar el QR e intentá de nuevo.
                </p>
              </div>
            )}

            {(pairingCode || qrValue) && (
              <p className="text-xs text-muted-foreground">
                {reachedAutoLimit
                  ? 'Límite de actualizaciones alcanzado. Tocá "Volver a cargar" cuando estés listo.'
                  : `Se actualiza en ${countdown}s`}
              </p>
            )}

            {(!needsQr || reachedAutoLimit) && (
              <div className="flex flex-wrap gap-2">
                {!needsQr && (
                  <Button
                    size="sm"
                    onClick={handleStartLink}
                    disabled={linkSession.isPending || refreshSession.isPending}
                  >
                    <QrCodeIcon data-icon="inline-start" />
                    {linkSession.isPending
                      ? 'Solicitando...'
                      : 'Generar QR y codigo'}
                  </Button>
                )}

                {reachedAutoLimit && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleManualReset}
                    disabled={
                      resetRefresh.isPending ||
                      linkSession.isPending ||
                      !localPhonePart(phoneNumber)
                    }
                  >
                    <RefreshCcwIcon data-icon="inline-start" />
                    Volver a cargar
                  </Button>
                )}
              </div>
            )}
          </>
        )}

        <div className="border-t pt-3">
          {!showDeleteConfirm ? (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleteSession.isPending}
            >
              <Trash2Icon data-icon="inline-start" />
              Desvincular WhatsApp
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <p className="text-sm text-destructive">
                ¿Desvincular este WhatsApp?
              </p>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteSession.isPending}
              >
                {deleteSession.isPending ? 'Eliminando...' : 'Confirmar'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowDeleteConfirm(false)}
              >
                <XIcon data-icon="inline-start" />
                Cancelar
              </Button>
            </div>
          )}
        </div>
      </div>
    </DialogContent>
  );
};

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export const CashierSessionPage = () => {
  const { data: runtimeState, isLoading: runtimeLoading } =
    useCashierRuntimeState();
  const { data: myWhatsappSessions = [], isLoading: mySessionsLoading } =
    useMySessions();

  const { data: currentSession, isLoading: currentLoading } =
    useCurrentSession();
  const { data: sessions = [], isLoading: sessionsLoading } =
    useCashierSessions();
  const startSession = useStartSession();
  const finishSession = useFinishSession();
  const createMySession = useCreateMySession();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const selectedSession = selectedSessionId
    ? myWhatsappSessions.find((s) => s.id === selectedSessionId) ?? null
    : null;
  // If the selected session disappears (deleted by admin or elsewhere), close
  // the modal so the cashier isn't stuck on a stale screen. Clear during
  // render (not in an effect) — React batches this with the current render
  // and avoids the cascading re-render lint warning.
  if (selectedSessionId && !selectedSession) {
    setSelectedSessionId(null);
  }
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Operate gate: at least 1 session WORKING (anyWorking)
  const anyWorking = runtimeState?.anyWorking ?? false;

  // Fetch cashier maxSessions from runtime state indirectly — we check if create is capped
  // by comparing count to the cap. We use the runtimeState sessions array length as a reference.
  const runtimeSessionCount =
    runtimeState?.sessions?.length ?? myWhatsappSessions.length;

  const handleStart = async () => {
    try {
      await startSession.mutateAsync();
      toast.success('Sesion iniciada');
    } catch {
      toast.error('No se pudo iniciar sesion');
    }
  };

  const handleFinish = async () => {
    try {
      await finishSession.mutateAsync();
      toast.success('Sesion finalizada');
      setPage(1);
    } catch {
      toast.error('No se pudo finalizar sesion');
    }
  };

  const handleCreateSession = async () => {
    try {
      const newSession = await createMySession.mutateAsync();
      toast.success('Nueva sesion creada');
      setSelectedSessionId(newSession.id);
    } catch (error) {
      const apiMessage = isAxiosError<{ message?: string; error?: string }>(
        error,
      )
        ? (error.response?.data?.message ?? error.response?.data?.error)
        : null;
      if (isAxiosError(error) && error.response?.status === 409) {
        toast.error('Limite de sesiones alcanzado');
      } else {
        toast.error(apiMessage ?? 'No se pudo crear la sesion');
      }
    }
  };

  const totalPages = Math.max(1, Math.ceil(sessions.length / pageSize));
  const normalizedPage = Math.min(page, totalPages);
  const start = (normalizedPage - 1) * pageSize;
  const paginatedSessions = sessions.slice(start, start + pageSize);

  if (runtimeLoading || mySessionsLoading) {
    return (
      <section className="flex flex-col gap-4">
        <PageHeader
          title="Sesion y WhatsApp"
          description="Cargando estado del cajero."
        />
        {/* Skeleton Card 1 — mirrors "Sesiones de WhatsApp" */}
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-4 w-3/4" />
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Skeleton className="h-[72px] w-full rounded-lg" />
            <Skeleton className="h-[72px] w-full rounded-lg" />
          </CardContent>
        </Card>
        {/* Skeleton Card 2 — mirrors "Estado actual" */}
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-1/4" />
            <Skeleton className="h-4 w-2/3" />
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <Skeleton className="h-6 w-28 rounded-full" />
              <div className="flex gap-2">
                <Skeleton className="h-9 w-20" />
                <Skeleton className="h-9 w-24" />
              </div>
            </div>
          </CardContent>
        </Card>
        {/* Skeleton Card 3 — mirrors "Ultimas sesiones" */}
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-4 w-1/2" />
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        title="Sesion y WhatsApp"
        description="Gestioná tus sesiones de WhatsApp e iniciá tu jornada de trabajo."
      />

      {/* WhatsApp Sessions Panel */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>Sesiones de WhatsApp</CardTitle>
              <CardDescription>
                Tocá una sesión para vincular WhatsApp o ver su estado.
                Necesitás al menos una conectada para operar.
              </CardDescription>
            </div>
            {runtimeState && (
              <CapacityMeter
                used={runtimeSessionCount}
                total={runtimeState.maxSessions}
                className="shrink-0"
              />
            )}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {myWhatsappSessions.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              <SmartphoneIcon className="size-8 opacity-40" />
              <p>Todavía no tenés sesiones de WhatsApp.</p>
              <p className="text-xs">
                Creá una para empezar a recibir clientes.
              </p>
            </div>
          ) : (
            <ul className="flex max-h-[420px] flex-col gap-2 overflow-y-auto scrollbar-thin pr-1">
              {myWhatsappSessions.map((ws) => {
                const aliasName = ws.alias?.trim();
                const phone = ws.whatsappPhoneNumber;
                const title = aliasName || (phone ? `+${phone}` : 'Sin número vinculado');
                const subtitle = aliasName
                  ? (phone ? `+${phone}` : 'Tocá para conectar')
                  : phone
                    ? undefined
                    : 'Tocá para conectar';
                return (
                  <li key={ws.id}>
                    <SessionLineCard
                      status={ws.wahaStatus}
                      title={title}
                      subtitle={subtitle}
                      onClick={() => setSelectedSessionId(ws.id)}
                      trailing={<ChevronRightIcon className="size-4" />}
                    />
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleCreateSession}
              disabled={
                createMySession.isPending ||
                (runtimeState
                  ? runtimeSessionCount >= runtimeState.maxSessions
                  : false)
              }
            >
              <PlusIcon data-icon="inline-start" />
              {createMySession.isPending
                ? 'Creando...'
                : 'Conectar otro WhatsApp'}
            </Button>
            {runtimeState &&
              runtimeSessionCount >= runtimeState.maxSessions && (
                <Badge variant="outline" className="text-xs">
                  Límite alcanzado
                </Badge>
              )}
          </div>
        </CardContent>
      </Card>

      {/* Work session control */}
      <Card>
        <CardHeader>
          <CardTitle>Estado actual</CardTitle>
          <CardDescription>
            Control en tiempo real de tu sesion activa.{' '}
            {!anyWorking && (
              <span className="text-warning">
                Necesitas al menos 1 WhatsApp conectado para iniciar.
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            {currentLoading ? (
              <Skeleton className="h-6 w-28 rounded-full" />
            ) : currentSession?.isActive ? (
              <StatusBadge variant="default" icon={CheckCircle2Icon}>
                Sesion activa
              </StatusBadge>
            ) : (
              <StatusBadge variant="outline" icon={CircleDashedIcon}>
                Sin sesion activa
              </StatusBadge>
            )}
            {currentSession?.startDate ? (
              <p className="text-sm text-muted-foreground">
                Inicio: {formatDateTime(currentSession.startDate)}
              </p>
            ) : null}
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleStart}
              disabled={
                Boolean(currentSession?.isActive) ||
                startSession.isPending ||
                !anyWorking
              }
            >
              <PlayIcon data-icon="inline-start" />
              Iniciar
            </Button>
            <Button
              variant="outline"
              onClick={handleFinish}
              disabled={!currentSession?.isActive || finishSession.isPending}
            >
              <SquareIcon data-icon="inline-start" />
              Finalizar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Session history */}
      <Card>
        <CardHeader>
          <CardTitle>Ultimas sesiones</CardTitle>
          <CardDescription>
            Historial reciente de sesiones de trabajo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Inicio</TableHead>
                <TableHead>Fin</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Tiempo activo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessionsLoading ? (
                <TableRowsSkeleton rows={5} cols={4} />
              ) : sessions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4}>Aun no registras sesiones.</TableCell>
                </TableRow>
              ) : (
                paginatedSessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell>{formatDateTime(session.startDate)}</TableCell>
                    <TableCell>
                      {session.endDate ? formatDateTime(session.endDate) : '-'}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        variant={session.isActive ? 'default' : 'outline'}
                        icon={session.isActive ? CheckCircle2Icon : CircleDashedIcon}
                      >
                        {session.isActive ? 'Activa' : 'Finalizada'}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>{formatDuration(session.activeMinutes)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <div className="mt-3">
            <PaginationControls
              page={normalizedPage}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          </div>
        </CardContent>
      </Card>

      {/* Per-session modal */}
      <Dialog
        open={Boolean(selectedSession)}
        onOpenChange={(open) => {
          if (!open) setSelectedSessionId(null);
        }}
      >
        {selectedSession && (
          <SessionModal
            session={selectedSession}
            onClose={() => setSelectedSessionId(null)}
          />
        )}
      </Dialog>
    </section>
  );
};
