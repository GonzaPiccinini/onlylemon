import { PlayIcon, SquareIcon } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
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
  useCashierSessions,
  useCurrentSession,
  useFinishSession,
  useStartSession,
} from '@/features/cashier/cashier-hooks';

export const CashierSessionPage = () => {
  const { data: currentSession, isLoading: currentLoading } =
    useCurrentSession();
  const { data: sessions = [], isLoading: sessionsLoading } =
    useCashierSessions();
  const startSession = useStartSession();
  const finishSession = useFinishSession();

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
    } catch {
      toast.error('No se pudo finalizar sesion');
    }
  };

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
                sessions.map((session) => (
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
                    <TableCell>{session.activeMinutes}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </section>
  );
};
