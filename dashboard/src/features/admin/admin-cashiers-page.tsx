import { useState } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CheckCircle2Icon,
  CircleDashedIcon,
  ClockIcon,
  LinkIcon,
  LogOutIcon,
  MoreHorizontalIcon,
  PencilLineIcon,
  PlusIcon,
  SmartphoneIcon,
  UserX2Icon,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { TableRowsSkeleton } from '@/components/common/table-skeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/common/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Cashier } from '@/types/domain';
import { formatDateTime } from '@/lib/format';
import {
  useAdminCashiers,
  useCreateCashier,
  useDisableCashier,
  useEnableCashier,
  useFinishCashierWorkSession,
  useUpdateCashier,
} from '@/features/admin/admin-hooks';
import { PaginationControls } from '@/components/common/pagination-controls';
import { AdminCashierSessionsPanel } from './admin-cashier-sessions-panel';
import { AdminCashierLandingsPanel } from './admin-cashier-landings-panel';

const createSchema = z.object({
  name: z.string().min(2, 'Nombre obligatorio'),
  username: z.string().min(3, 'Usuario obligatorio'),
  password: z.string().min(6, 'Minimo 6 caracteres'),
});

const updateSchema = z.object({
  name: z.string().min(2, 'Nombre obligatorio'),
  username: z.string().min(3, 'Usuario obligatorio'),
  password: z
    .string()
    .optional()
    .refine(
      (value) =>
        value === undefined || value.trim() === '' || value.trim().length >= 6,
      {
        message: 'Minimo 6 caracteres',
      },
    ),
});

type CreateValues = z.infer<typeof createSchema>;
type UpdateValues = z.infer<typeof updateSchema>;

const operationalState = (
  cashier: Cashier,
): { label: string; variant: 'default' | 'outline' } =>
  cashier.hasActiveWorkSession
    ? { label: 'En turno', variant: 'default' }
    : { label: 'Fuera de turno', variant: 'outline' };

export const AdminCashiersPage = () => {
  const { data: cashiers = [], isLoading } = useAdminCashiers();
  const createCashier = useCreateCashier();
  const disableCashier = useDisableCashier();
  const enableCashier = useEnableCashier();
  const finishCashierWorkSession = useFinishCashierWorkSession();
  const updateCashier = useUpdateCashier();
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingCashier, setEditingCashier] = useState<Cashier | null>(null);
  const [sessionsPanelCashierId, setSessionsPanelCashierId] =
    useState<string | null>(null);
  const sessionsPanelCashier =
    sessionsPanelCashierId
      ? cashiers.find((c) => c.id === sessionsPanelCashierId) ?? null
      : null;
  const [landingsPanelCashier, setLandingsPanelCashier] =
    useState<Cashier | null>(null);

  const createForm = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      name: '',
      username: '',
      password: '',
    },
  });

  const updateForm = useForm<UpdateValues>({
    resolver: zodResolver(updateSchema),
    defaultValues: {
      name: '',
      username: '',
    },
  });

  const onCreate = async (values: CreateValues) => {
    try {
      await createCashier.mutateAsync(values);
      toast.success('Cajero creado');
      createForm.reset();
      setCreateDialogOpen(false);
    } catch {
      toast.error('No se pudo crear el cajero');
    }
  };

  const onUpdate = async (values: UpdateValues) => {
    if (!editingCashier) {
      return;
    }

    try {
      const payload = {
        name: values.name,
        username: values.username,
        ...(values.password?.trim()
          ? { password: values.password.trim() }
          : {}),
      };

      await updateCashier.mutateAsync({
        cashierId: editingCashier.id,
        input: payload,
      });

      toast.success('Cajero actualizado');
      setEditingCashier(null);
    } catch {
      toast.error('No se pudo actualizar el cajero');
    }
  };

  const onDisable = async (cashierId: string) => {
    try {
      await disableCashier.mutateAsync(cashierId);
      toast.success('Cajero deshabilitado');
    } catch {
      toast.error('No se pudo deshabilitar');
    }
  };

  const onEnable = async (cashierId: string) => {
    try {
      await enableCashier.mutateAsync(cashierId);
      toast.success('Cajero activado');
    } catch {
      toast.error('No se pudo activar');
    }
  };

  const onFinishWorkSession = async (cashierId: string) => {
    try {
      await finishCashierWorkSession.mutateAsync(cashierId);
      toast.success('Sesion de trabajo finalizada');
    } catch {
      toast.error('No se pudo finalizar la sesion');
    }
  };

  const openEditDialog = (cashier: Cashier) => {
    setEditingCashier(cashier);
    updateForm.reset({
      name: cashier.name,
      username: cashier.username,
      password: '',
    });
  };

  const totalPages = Math.max(1, Math.ceil(cashiers.length / pageSize));
  const normalizedPage = Math.min(page, totalPages);
  const start = (normalizedPage - 1) * pageSize;
  const paginatedCashiers = cashiers.slice(start, start + pageSize);

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        title="Gestion de cajeros"
        description="Administra altas, ediciones y estado operativo de los cajeros."
        actions={
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger render={<Button />}>
              <PlusIcon data-icon="inline-start" />
              Nuevo cajero
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Crear cajero</DialogTitle>
                <DialogDescription>
                  Completa los datos para habilitar la operacion de un nuevo
                  cajero.
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={createForm.handleSubmit(onCreate)}
                className="flex flex-col gap-4"
              >
                <FieldGroup>
                  <Field
                    data-invalid={Boolean(createForm.formState.errors.name)}
                  >
                    <FieldLabel htmlFor="create-name">Nombre</FieldLabel>
                    <FieldContent>
                      <Input
                        id="create-name"
                        aria-invalid={Boolean(createForm.formState.errors.name)}
                        {...createForm.register('name')}
                      />
                      <FieldError errors={[createForm.formState.errors.name]} />
                    </FieldContent>
                  </Field>

                  <Field
                    data-invalid={Boolean(createForm.formState.errors.username)}
                  >
                    <FieldLabel htmlFor="create-username">Usuario</FieldLabel>
                    <FieldContent>
                      <Input
                        id="create-username"
                        aria-invalid={Boolean(
                          createForm.formState.errors.username,
                        )}
                        {...createForm.register('username')}
                      />
                      <FieldError
                        errors={[createForm.formState.errors.username]}
                      />
                    </FieldContent>
                  </Field>

                  <Field
                    data-invalid={Boolean(createForm.formState.errors.password)}
                  >
                    <FieldLabel htmlFor="create-password">Password</FieldLabel>
                    <FieldContent>
                      <Input
                        id="create-password"
                        type="password"
                        aria-invalid={Boolean(
                          createForm.formState.errors.password,
                        )}
                        {...createForm.register('password')}
                      />
                      <FieldError
                        errors={[createForm.formState.errors.password]}
                      />
                    </FieldContent>
                  </Field>
                </FieldGroup>

                <DialogFooter>
                  <Button type="submit" disabled={createCashier.isPending}>
                    {createCashier.isPending
                      ? 'Guardando...'
                      : 'Guardar cajero'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <Card>
        <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Turno</TableHead>
              <TableHead>Sesiones de WhatsApp</TableHead>
              <TableHead>Creado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRowsSkeleton rows={5} cols={6} />
            ) : cashiers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>No hay cajeros registrados.</TableCell>
              </TableRow>
            ) : (
              paginatedCashiers.map((cashier) => (
                <TableRow key={cashier.id}>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span>{cashier.name}</span>
                      <span className="text-xs text-muted-foreground">
                        Usuario: {cashier.username}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      variant={
                        cashier.status === 'ACTIVE' ? 'default' : 'outline'
                      }
                      icon={
                        cashier.status === 'ACTIVE'
                          ? CheckCircle2Icon
                          : CircleDashedIcon
                      }
                    >
                      {cashier.status === 'ACTIVE' ? 'Activo' : 'Deshabilitado'}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const state = operationalState(cashier);
                      const StateIcon = cashier.hasActiveWorkSession
                        ? ClockIcon
                        : CircleDashedIcon;
                      return (
                        <StatusBadge
                          variant={state.variant}
                          icon={StateIcon}
                          className="w-fit"
                        >
                          {state.label}
                        </StatusBadge>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const wc = cashier.workingSessionsCount ?? 0;
                      const sc = cashier.sessions.length;
                      return (
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1">
                            {wc > 0 ? (
                              <CheckCircle2Icon className="size-3.5 shrink-0 text-success" />
                            ) : (
                              <span className="size-3.5 shrink-0 rounded-full bg-muted-foreground/30 inline-block" />
                            )}
                            <span className="text-sm font-medium">
                              {wc} conectada{wc !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {sc} creada{sc !== 1 ? 's' : ''} · max{' '}
                            {cashier.maxSessions}
                          </span>
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell>{formatDateTime(cashier.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="outline"
                              size="sm"
                              aria-label="Acciones"
                            />
                          }
                        >
                          <MoreHorizontalIcon className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem
                            onClick={() => setSessionsPanelCashierId(cashier.id)}
                          >
                            <SmartphoneIcon className="size-4" />
                            Gestionar sesiones de WhatsApp
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setLandingsPanelCashier(cashier)}
                          >
                            <LinkIcon className="size-4" />
                            Asignar landings
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => openEditDialog(cashier)}
                          >
                            <PencilLineIcon className="size-4" />
                            Editar
                          </DropdownMenuItem>
                          {cashier.hasActiveWorkSession ? (
                            <DropdownMenuItem
                              disabled={finishCashierWorkSession.isPending}
                              onClick={() => onFinishWorkSession(cashier.id)}
                            >
                              <LogOutIcon className="size-4" />
                              Cerrar turno
                            </DropdownMenuItem>
                          ) : null}
                          {cashier.status === 'ACTIVE' ? (
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => onDisable(cashier.id)}
                            >
                              <UserX2Icon className="size-4" />
                              Deshabilitar
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => onEnable(cashier.id)}
                            >
                              <CheckCircle2Icon className="size-4" />
                              Activar
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
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

      {/* Edit cashier dialog */}
      <Dialog
        open={Boolean(editingCashier)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingCashier(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar cajero</DialogTitle>
            <DialogDescription>
              Actualiza nombre y usuario del cajero.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={updateForm.handleSubmit(onUpdate)}
            className="flex flex-col gap-4"
          >
            <FieldGroup>
              <Field data-invalid={Boolean(updateForm.formState.errors.name)}>
                <FieldLabel htmlFor="edit-name">Nombre</FieldLabel>
                <FieldContent>
                  <Input
                    id="edit-name"
                    aria-invalid={Boolean(updateForm.formState.errors.name)}
                    {...updateForm.register('name')}
                  />
                  <FieldError errors={[updateForm.formState.errors.name]} />
                </FieldContent>
              </Field>
              <Field
                data-invalid={Boolean(updateForm.formState.errors.username)}
              >
                <FieldLabel htmlFor="edit-username">Usuario</FieldLabel>
                <FieldContent>
                  <Input
                    id="edit-username"
                    aria-invalid={Boolean(updateForm.formState.errors.username)}
                    {...updateForm.register('username')}
                  />
                  <FieldError errors={[updateForm.formState.errors.username]} />
                </FieldContent>
              </Field>
              <Field
                data-invalid={Boolean(updateForm.formState.errors.password)}
              >
                <FieldLabel htmlFor="edit-password">Nueva password</FieldLabel>
                <FieldContent>
                  <Input
                    id="edit-password"
                    type="password"
                    aria-invalid={Boolean(updateForm.formState.errors.password)}
                    {...updateForm.register('password')}
                  />
                  <p className="text-xs text-muted-foreground">
                    Deja este campo vacio para conservar la password actual.
                  </p>
                  <FieldError errors={[updateForm.formState.errors.password]} />
                </FieldContent>
              </Field>
            </FieldGroup>

            <DialogFooter>
              <Button type="submit" disabled={updateCashier.isPending}>
                {updateCashier.isPending ? 'Guardando...' : 'Actualizar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Sessions panel dialog */}
      <Dialog
        open={Boolean(sessionsPanelCashier)}
        onOpenChange={(open) => {
          if (!open) setSessionsPanelCashierId(null);
        }}
      >
        <DialogContent className="w-[95vw] sm:max-w-[95vw] md:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Sesiones de WhatsApp</DialogTitle>
            <DialogDescription className="truncate" title={sessionsPanelCashier?.name}>
              {sessionsPanelCashier?.name}
            </DialogDescription>
          </DialogHeader>
          {sessionsPanelCashier && (
            <AdminCashierSessionsPanel cashier={sessionsPanelCashier} />
          )}
        </DialogContent>
      </Dialog>

      {/* Landings assignment dialog */}
      <Dialog
        open={Boolean(landingsPanelCashier)}
        onOpenChange={(open) => {
          if (!open) setLandingsPanelCashier(null);
        }}
      >
        <DialogContent className="w-[95vw] sm:max-w-[95vw] md:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Asignar landings — {landingsPanelCashier?.name}
            </DialogTitle>
            <DialogDescription>
              Vincula cada sesion de WhatsApp con las landings que recibiran sus
              leads.
            </DialogDescription>
          </DialogHeader>
          {landingsPanelCashier && (
            <AdminCashierLandingsPanel cashier={landingsPanelCashier} />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
};
