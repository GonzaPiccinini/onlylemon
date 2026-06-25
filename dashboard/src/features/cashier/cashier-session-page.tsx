import { useCallback, useEffect, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import {
  ChevronRightIcon,
  CheckIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  PlayIcon,
  QrCodeIcon,
  RefreshCcwIcon,
  SmartphoneIcon,
  SquareIcon,
  PlusIcon,
  Trash2Icon,
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
import { formatDateTime } from '@/lib/format';
import {
  wahaStatusIcon,
  wahaStatusLabel,
  wahaStatusVariant,
} from '@/lib/waha-status';
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
import { SessionAliasEditor } from '@/features/chat/components';
import type { ChatScope } from '@/api/chat.service';
import type { MyWhatsappSession } from '@/types/domain';

const REFRESH_INTERVAL_SECONDS = 45;

// ---------------------------------------------------------------------------
// Status badge helper
// ---------------------------------------------------------------------------

const WahaStatusBadge = ({ status }: { status: string | undefined | null }) => (
  <StatusBadge variant={wahaStatusVariant(status)} icon={wahaStatusIcon(status)}>
    {wahaStatusLabel(status)}
  </StatusBadge>
);

// ---------------------------------------------------------------------------
// Session modal (per-session QR/pairing/status/refresh/delete)
// ---------------------------------------------------------------------------

interface SessionModalProps {
  session: MyWhatsappSession;
  cashierMaxSessions: number;
  onClose: () => void;
}

const SessionModal = ({ session, onClose }: SessionModalProps) => {
  const [phoneNumber, setPhoneNumber] = useState(
    session.whatsappPhoneNumber ?? '',
  );
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [qrValue, setQrValue] = useState<string | null>(null);
  const [refreshCount, setRefreshCount] = useState(session.refreshCount);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL_SECONDS);
  const timerRef = useRef<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const REFRESH_CAP = 3;

  const { data: liveStatus } = useMySessionStatus(session.id, true);
  const linkSession = useLinkMySession();
  const refreshSession = useRefreshMySession();
  const resetRefresh = useResetMySessionRefresh();
  const deleteSession = useDeleteMySession();

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
    if (!phoneNumber.trim()) {
      toast.error('Ingresa un numero de telefono');
      return;
    }

    try {
      const data = await linkSession.mutateAsync({
        sessionId: session.id,
        phoneNumber: phoneNumber.trim(),
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

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          WhatsApp Session
          <WahaStatusBadge status={wahaStatus} />
        </DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span>ID: {session.id.slice(0, 8)}...</span>
          <span>Nombre: {session.sessionName}</span>
          <span>
            Intentos: {refreshCount}/{REFRESH_CAP}
          </span>
        </div>

        {/* Alias — assign/edit a friendly name for this session. */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Alias:</span>
          <SessionAliasEditor
            scope={{ kind: 'cashier', cashierId: '' } satisfies ChatScope}
            sessionId={session.id}
            alias={session.alias}
          />
        </div>

        {isWorking ? (
          <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-500 ring-1 ring-emerald-500/30">
              <CheckIcon className="size-4" strokeWidth={3} />
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-sm font-medium leading-tight">
                Conectado a WhatsApp
              </p>
              {session.whatsappPhoneNumber && (
                <p className="truncate font-mono text-xs text-muted-foreground">
                  +{session.whatsappPhoneNumber}
                </p>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2 rounded-lg border p-3">
              <p className="text-sm font-medium">Numero de telefono</p>
              <Input
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="Ej: 5491112345678"
                disabled={linkSession.isPending}
              />
            </div>

            {pairingCode && (
              <div className="flex flex-col gap-1 rounded-lg border p-3">
                <p className="text-sm font-medium">Codigo de vinculacion</p>
                <p className="text-lg tracking-wide text-primary">
                  {pairingCode}
                </p>
              </div>
            )}

            {(qrValue || needsQr) && (
              <div className="flex flex-col gap-2 rounded-lg border p-3">
                <p className="text-sm font-medium">QR</p>
                {qrValue ? (
                  <img
                    src={qrValue}
                    alt="QR WhatsApp"
                    className="h-48 w-48 rounded-md border object-contain"
                  />
                ) : (
                  <div className="flex h-32 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                    QR no disponible
                  </div>
                )}
              </div>
            )}

            {(pairingCode || qrValue) && (
              <p className="text-xs text-muted-foreground">
                {reachedAutoLimit
                  ? 'Limite de refrescos alcanzado. Presiona "Volver a cargar" cuando estes listo.'
                  : `Proximo refresco en ${countdown}s`}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
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

              {reachedAutoLimit && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleManualReset}
                  disabled={
                    resetRefresh.isPending ||
                    linkSession.isPending ||
                    !phoneNumber.trim()
                  }
                >
                  <RefreshCcwIcon data-icon="inline-start" />
                  Volver a cargar
                </Button>
              )}
            </div>
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
              Eliminar sesion
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <p className="text-sm text-destructive">
                ¿Confirmar eliminacion?
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
  const maxSessions =
    myWhatsappSessions.length > 0
      ? myWhatsappSessions.length // use count to infer cap comparison
      : 0;

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
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            Verificando estado...
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
              <Badge variant="outline" className="shrink-0">
                {runtimeSessionCount}/{runtimeState.maxSessions}
              </Badge>
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
            <ul className="flex flex-col gap-2">
              {myWhatsappSessions.map((ws) => {
                const aliasName = ws.alias?.trim();
                const title =
                  aliasName || ws.whatsappPhoneNumber || 'Sin número vinculado';
                const metaParts: string[] = [];
                // When the alias is the title, surface the phone number too.
                if (aliasName && ws.whatsappPhoneNumber) {
                  metaParts.push(`+${ws.whatsappPhoneNumber}`);
                }
                if (ws.whatsappPhoneNumber) {
                  metaParts.push(`Intentos ${ws.refreshCount}/3`);
                  if (ws.lastRefreshAt) {
                    metaParts.push(
                      `Último ${formatDateTime(ws.lastRefreshAt)}`,
                    );
                  }
                } else {
                  metaParts.push('Tocá para escanear el QR');
                }
                return (
                  <li key={ws.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedSessionId(ws.id)}
                      className="group flex w-full min-w-0 items-center gap-3 rounded-lg border bg-card p-3 text-left transition-all hover:border-primary/40 hover:bg-muted/50 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
                        <SmartphoneIcon className="size-5 text-muted-foreground" />
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <p className="truncate text-sm font-medium">{title}</p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <WahaStatusBadge status={ws.wahaStatus} />
                          <span className="truncate text-xs text-muted-foreground">
                            {metaParts.join(' · ')}
                          </span>
                        </div>
                      </div>
                      <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                    </button>
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
              <span className="text-amber-600">
                Necesitas al menos 1 WhatsApp conectado para iniciar.
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            {currentLoading ? (
              <Badge variant="outline">Cargando...</Badge>
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
                <TableHead>Minutos activos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessionsLoading ? (
                <TableRow>
                  <TableCell colSpan={4}>Cargando sesiones...</TableCell>
                </TableRow>
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
                    <TableCell>{session.activeMinutes.toFixed(2)}</TableCell>
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
            cashierMaxSessions={maxSessions}
            onClose={() => setSelectedSessionId(null)}
          />
        )}
      </Dialog>
    </section>
  );
};
