import { useEffect, useMemo, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import { PlayIcon, QrCodeIcon, RefreshCcwIcon, SquareIcon } from 'lucide-react';
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
  useCashierRuntimeState,
  useCompleteWhatsappLink,
  useCashierSessions,
  useCurrentSession,
  useFinishSession,
  useRefreshWhatsappLink,
  useResetWhatsappLink,
  useStartSession,
  useStartWhatsappLink,
  useWhatsappLinkState,
  useWhatsappLinkStatus,
} from '@/features/cashier/cashier-hooks';
import { PaginationControls } from '@/components/common/pagination-controls';

const REFRESH_INTERVAL_SECONDS = 45;

export const CashierSessionPage = () => {
  const { data: runtimeState, isLoading: runtimeLoading } = useCashierRuntimeState();
  const { data: linkState, isLoading: linkStateLoading } = useWhatsappLinkState();
  const { data: linkStatus } = useWhatsappLinkStatus();

  const { data: currentSession, isLoading: currentLoading } =
    useCurrentSession();
  const { data: sessions = [], isLoading: sessionsLoading } =
    useCashierSessions();
  const startSession = useStartSession();
  const finishSession = useFinishSession();

  const startWhatsappLink = useStartWhatsappLink();
  const refreshWhatsappLink = useRefreshWhatsappLink();
  const resetWhatsappLink = useResetWhatsappLink();
  const completeWhatsappLink = useCompleteWhatsappLink();

  const requiresWhatsappSetup =
    runtimeState?.wahaStatus !== 'WORKING' || Boolean(linkState?.needsLink);

  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [qrValue, setQrValue] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [refreshCount, setRefreshCount] = useState(0);
  const [maxRefresh, setMaxRefresh] = useState(3);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL_SECONDS);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const timerRef = useRef<number | null>(null);
  const lastCompletedSessionRef = useRef<string | null>(null);

  const stopRefreshTimer = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const applyArtifacts = (artifacts: {
    pairingCode: string | null;
    qr: string | null;
    refreshCount: number;
    maxRefresh: number;
  }) => {
    const normalizedQr =
      artifacts.qr && !artifacts.qr.startsWith('data:')
        ? `data:image/png;base64,${artifacts.qr}`
        : artifacts.qr;

    setPairingCode((current) => artifacts.pairingCode ?? current);
    setQrValue((current) => normalizedQr ?? current);
    setRefreshCount(artifacts.refreshCount);
    setMaxRefresh(artifacts.maxRefresh);
    setCountdown(REFRESH_INTERVAL_SECONDS);
  };

  const handleStartLink = async () => {
    if (!phoneNumber.trim()) {
      toast.error('Ingresa un numero de telefono para solicitar codigo');
      return;
    }

    try {
      const data = await startWhatsappLink.mutateAsync(phoneNumber.trim());
      applyArtifacts(data);
      stopRefreshTimer();
      timerRef.current = window.setInterval(() => {
        setCountdown((current) => {
          if (current <= 1) {
            void handleAutoRefresh();
            return REFRESH_INTERVAL_SECONDS;
          }
          return current - 1;
        });
      }, 1000);
      toast.success('QR y codigo cargados');
    } catch (error) {
      const apiMessage =
        isAxiosError<{ message?: string; error?: string }>(error)
          ? (error.response?.data?.message ?? error.response?.data?.error)
          : null;

      if (apiMessage) {
        toast.error(apiMessage);
      } else {
        toast.error('No se pudieron solicitar credenciales de WhatsApp');
      }
    }
  };

  const handleAutoRefresh = async () => {
    try {
      const data = await refreshWhatsappLink.mutateAsync();
      applyArtifacts(data);
    } catch {
      stopRefreshTimer();
      toast.error('Se alcanzo el limite de refrescos automaticos');
    }
  };

  const handleManualReset = async () => {
    try {
      await resetWhatsappLink.mutateAsync();
      toast.success('Refrescos reiniciados');
      await handleStartLink();
    } catch {
      toast.error('No se pudieron reiniciar los refrescos');
    }
  };

  useEffect(() => {
    if (!requiresWhatsappSetup) {
      stopRefreshTimer();
      return;
    }

    return () => {
      stopRefreshTimer();
    };
  }, [requiresWhatsappSetup]);

  const previousSessionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!requiresWhatsappSetup) {
      previousSessionRef.current = runtimeState?.sessionName ?? null;
      return;
    }

    const currentSession = runtimeState?.sessionName ?? null;
    const previousSession = previousSessionRef.current;
    const enteredFreshReconnect = previousSession !== currentSession;

    if (!enteredFreshReconnect) {
      return;
    }

    previousSessionRef.current = currentSession;
    const shouldClearArtifacts = !currentSession && !(linkState?.sessionName ?? '').trim();
    if (shouldClearArtifacts) {
      setPairingCode(null);
      setQrValue(null);
      setRefreshCount(0);
      setMaxRefresh(3);
      setCountdown(REFRESH_INTERVAL_SECONDS);
      setPhoneNumber('');
    }
  }, [requiresWhatsappSetup, runtimeState?.sessionName, linkState?.sessionName]);

  useEffect(() => {
    if (!linkState?.needsLink || !linkStatus?.linked || !linkStatus.sessionName) {
      if (!linkStatus?.linked) {
        lastCompletedSessionRef.current = null;
      }
      return;
    }

    if (completeWhatsappLink.isPending) {
      return;
    }

    if (lastCompletedSessionRef.current === linkStatus.sessionName) {
      return;
    }

    stopRefreshTimer();
    void completeWhatsappLink.mutateAsync(linkStatus.sessionName).then(
      () => {
        lastCompletedSessionRef.current = linkStatus.sessionName;
        toast.success('WhatsApp vinculado correctamente');
      },
      () => {
        toast.error('No se pudo completar la vinculacion en backend');
      },
    );
  }, [
    completeWhatsappLink,
    completeWhatsappLink.isPending,
    linkState?.needsLink,
    linkStatus?.linked,
    linkStatus?.sessionName,
  ]);

  const reachedAutoLimit = useMemo(
    () => refreshCount >= maxRefresh,
    [maxRefresh, refreshCount],
  );

  const totalPages = Math.max(1, Math.ceil(sessions.length / pageSize));
  const normalizedPage = Math.min(page, totalPages);
  const start = (normalizedPage - 1) * pageSize;
  const paginatedSessions = sessions.slice(start, start + pageSize);

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

  if (linkStateLoading || runtimeLoading) {
    return (
      <section className='flex flex-col gap-4'>
        <PageHeader
          title='Vincular WhatsApp'
          description='Cargando estado de vinculacion del cajero.'
        />
        <Card>
          <CardContent className='py-8 text-sm text-muted-foreground'>
            Verificando estado de WhatsApp...
          </CardContent>
        </Card>
      </section>
    );
  }

  if (requiresWhatsappSetup) {
    return (
      <section className='flex flex-col gap-4'>
        <PageHeader
          title='Vincular WhatsApp'
          description='Debes iniciar sesion de WhatsApp para operar como cajero.'
        />

        <Card>
          <CardHeader>
            <CardTitle>Autenticacion de WhatsApp</CardTitle>
            <CardDescription>
              Solicita QR y codigo, se refrescan cada 45 segundos hasta 3 intentos.
            </CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col gap-4'>
            <div className='flex flex-wrap items-center gap-2'>
              <Badge variant='outline'>Sesion: {linkState?.sessionName ?? runtimeState?.sessionName ?? '-'}</Badge>
              <Badge variant='outline'>Intentos: {refreshCount}/{maxRefresh}</Badge>
              <Badge variant='outline'>Estado WAHA: {linkStatus?.status ?? linkState?.status ?? runtimeState?.wahaStatus ?? 'UNLINKED'}</Badge>
            </div>

            <div className='flex flex-col gap-2 rounded-lg border p-3'>
              <p className='text-sm font-medium'>Numero de telefono</p>
              <Input
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
                placeholder='Ej: 5491112345678'
              />
              <p className='text-xs text-muted-foreground'>
                Este numero se usa para solicitar el codigo de emparejamiento en WAHA.
              </p>
            </div>

            <div className='flex flex-col gap-2 rounded-lg border p-3'>
              <p className='text-sm font-medium'>Codigo de vinculacion</p>
              <p className='text-lg tracking-wide text-primary'>
                {pairingCode ?? 'Sin codigo aun'}
              </p>
            </div>

            <div className='flex flex-col gap-2 rounded-lg border p-3'>
              <p className='text-sm font-medium'>QR</p>
              {qrValue ? (
                <img src={qrValue} alt='QR WhatsApp' className='h-56 w-56 rounded-md border object-contain' />
              ) : (
                <div className='flex h-40 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground'>
                  QR no disponible aun
                </div>
              )}
            </div>

            {!reachedAutoLimit ? (
              <p className='text-sm text-muted-foreground'>
                Proximo refresco automatico en {countdown}s.
              </p>
            ) : (
              <p className='text-sm text-destructive'>
                Se alcanzo el limite de refrescos automaticos. Presiona "Volver a cargar" cuando estes listo.
              </p>
            )}

            <div className='flex flex-wrap gap-2'>
              <Button
                onClick={handleStartLink}
                disabled={
                  startWhatsappLink.isPending ||
                  refreshWhatsappLink.isPending ||
                  completeWhatsappLink.isPending
                }
              >
                <QrCodeIcon data-icon='inline-start' />
                {startWhatsappLink.isPending ? 'Solicitando...' : 'Generar QR y codigo'}
              </Button>
              <Button
                variant='outline'
                onClick={handleManualReset}
                disabled={
                  resetWhatsappLink.isPending ||
                  startWhatsappLink.isPending ||
                  refreshWhatsappLink.isPending ||
                  completeWhatsappLink.isPending ||
                  !reachedAutoLimit ||
                  !phoneNumber.trim()
                }
              >
                <RefreshCcwIcon data-icon='inline-start' />
                Volver a cargar
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className='flex flex-col gap-4'>
      <PageHeader
        title='Sesion de trabajo'
        description='Iniciá o finalizá tu jornada para habilitar la recepción de clientes.'
      />

      <Card>
        <CardHeader>
          <CardTitle>Estado actual</CardTitle>
          <CardDescription>
            Control en tiempo real de tu sesion activa.
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-4 md:flex-row md:items-center md:justify-between'>
          <div className='flex items-center gap-3'>
            {currentLoading ? (
              <Badge variant='outline'>Cargando...</Badge>
            ) : currentSession?.isActive ? (
              <Badge>Sesion activa</Badge>
            ) : (
              <Badge variant='outline'>Sin sesion activa</Badge>
            )}
            {currentSession?.startDate ? (
              <p className='text-sm text-muted-foreground'>
                Inicio: {formatDateTime(currentSession.startDate)}
              </p>
            ) : null}
          </div>

          <div className='flex gap-2'>
            <Button
              onClick={handleStart}
              disabled={
                Boolean(currentSession?.isActive) || startSession.isPending
              }
            >
              <PlayIcon data-icon='inline-start' />
              Iniciar
            </Button>
            <Button
              variant='outline'
              onClick={handleFinish}
              disabled={!currentSession?.isActive || finishSession.isPending}
            >
              <SquareIcon data-icon='inline-start' />
              Finalizar
            </Button>
          </div>
        </CardContent>
      </Card>

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
                      <Badge variant={session.isActive ? 'default' : 'outline'}>
                        {session.isActive ? 'Activa' : 'Finalizada'}
                      </Badge>
                    </TableCell>
                    <TableCell>{session.activeMinutes.toFixed(2)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <div className='mt-3'>
            <PaginationControls
              page={normalizedPage}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          </div>
        </CardContent>
      </Card>
    </section>
  );
};
