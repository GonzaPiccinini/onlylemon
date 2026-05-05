import { useState } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CheckCircle2Icon,
  PencilLineIcon,
  PlusIcon,
  TagsIcon,
  UserX2Icon,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
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
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Cashier, WahaStatus } from '@/types/domain';
import { formatDateTime } from '@/lib/format';
import {
  useAdminCashiers,
  useCreateCashier,
  useDisableCashier,
  useEnableCashier,
  useLandings,
  useReplaceCashierLandings,
  useUpdateCashier,
} from '@/features/admin/admin-hooks';
import { PaginationControls } from '@/components/common/pagination-controls';

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
    .refine((value) => value === undefined || value.trim() === '' || value.trim().length >= 6, {
      message: 'Minimo 6 caracteres',
    }),
});

type CreateValues = z.infer<typeof createSchema>;
type UpdateValues = z.infer<typeof updateSchema>;

const WAHA_STATUS_LABELS: Record<WahaStatus, string> = {
  WORKING: 'Conectado',
  SCAN_QR_CODE: 'Escaneando QR',
  STARTING: 'Iniciando',
  STOPPED: 'Detenido',
  FAILED: 'Error',
  UNLINKED: 'Sin vincular',
};

const wahaStatusLabel = (status: WahaStatus | undefined): string =>
  status ? WAHA_STATUS_LABELS[status] : WAHA_STATUS_LABELS.UNLINKED;

const operationalState = (
  cashier: Cashier,
): { label: string; variant: 'default' | 'outline' } =>
  cashier.hasActiveWorkSession
    ? { label: 'En turno', variant: 'default' }
    : { label: 'Fuera de turno', variant: 'outline' };

export const AdminCashiersPage = () => {
  const { data: cashiers = [], isLoading } = useAdminCashiers();
  const { data: landings = [] } = useLandings();
  const createCashier = useCreateCashier();
  const disableCashier = useDisableCashier();
  const enableCashier = useEnableCashier();
  const updateCashier = useUpdateCashier();
  const replaceCashierLandings = useReplaceCashierLandings();
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingCashier, setEditingCashier] = useState<Cashier | null>(null);
  const [assigningCashier, setAssigningCashier] = useState<Cashier | null>(
    null,
  );
  const [selectedLandingIds, setSelectedLandingIds] = useState<string[]>([]);

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
        ...(values.password?.trim() ? { password: values.password.trim() } : {}),
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

  const openLandingDialog = (cashier: Cashier) => {
    setAssigningCashier(cashier);
    setSelectedLandingIds(cashier.landings.map((landing) => landing.id));
  };

  const toggleLandingSelection = (landingId: string) => {
    setSelectedLandingIds((current) =>
      current.includes(landingId)
        ? current.filter((id) => id !== landingId)
        : [...current, landingId],
    );
  };

  const saveLandingAssociation = async () => {
    if (!assigningCashier) {
      return;
    }

    try {
      await replaceCashierLandings.mutateAsync({
        cashierId: assigningCashier.id,
        landingIds: selectedLandingIds,
      });
      toast.success('Landings actualizadas');
      setAssigningCashier(null);
    } catch {
      toast.error('No se pudieron actualizar las landings');
    }
  };

  return (
    <section className='flex flex-col gap-4'>
      <PageHeader
        title='Gestion de cajeros'
        description='Administra altas, ediciones y estado operativo de los cajeros.'
        actions={
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger render={<Button />}>
              <PlusIcon data-icon='inline-start' />
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
                className='flex flex-col gap-4'
              >
                <FieldGroup>
                  <Field
                    data-invalid={Boolean(createForm.formState.errors.name)}
                  >
                    <FieldLabel htmlFor='create-name'>Nombre</FieldLabel>
                    <FieldContent>
                      <Input
                        id='create-name'
                        aria-invalid={Boolean(createForm.formState.errors.name)}
                        {...createForm.register('name')}
                      />
                      <FieldError errors={[createForm.formState.errors.name]} />
                    </FieldContent>
                  </Field>

                  <Field
                    data-invalid={Boolean(createForm.formState.errors.username)}
                  >
                    <FieldLabel htmlFor='create-username'>Usuario</FieldLabel>
                    <FieldContent>
                      <Input
                        id='create-username'
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
                    <FieldLabel htmlFor='create-password'>Password</FieldLabel>
                    <FieldContent>
                      <Input
                        id='create-password'
                        type='password'
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
                  <Button type='submit' disabled={createCashier.isPending}>
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

      <div className='rounded-2xl border bg-card p-3 shadow-sm md:p-4'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Turno</TableHead>
              <TableHead>Landings</TableHead>
              <TableHead>Creado</TableHead>
              <TableHead className='text-right'>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7}>Cargando cajeros...</TableCell>
              </TableRow>
            ) : cashiers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7}>No hay cajeros registrados.</TableCell>
              </TableRow>
             ) : (
               paginatedCashiers.map((cashier) => (
                <TableRow key={cashier.id}>
                  <TableCell>
                    {cashier.name}
                    <span className='text-xs text-muted-foreground'>
                      Usuario: {cashier.username}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        cashier.status === 'ACTIVE' ? 'default' : 'outline'
                      }
                    >
                      {cashier.status === 'ACTIVE' ? 'Activo' : 'Deshabilitado'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const state = operationalState(cashier);
                      return (
                        <div className='flex flex-col gap-0.5'>
                          <Badge variant={state.variant} className='w-fit'>
                            {state.label}
                          </Badge>
                          <span className='text-xs text-muted-foreground'>
                            WhatsApp: {wahaStatusLabel(cashier.wahaStatus)}
                          </span>
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    <div className='flex flex-wrap gap-1'>
                      {cashier.landings.length === 0 ? (
                        <span className='text-xs text-muted-foreground'>
                          Sin landings
                        </span>
                      ) : (
                        cashier.landings.map((landing) => (
                          <Badge key={landing.id} variant='secondary'>
                            {landing.url}
                          </Badge>
                        ))
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{formatDateTime(cashier.createdAt)}</TableCell>
                  <TableCell className='text-right'>
                    <div className='flex justify-end gap-2'>
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={() => openLandingDialog(cashier)}
                      >
                        <TagsIcon data-icon='inline-start' />
                        Landings
                      </Button>
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={() => openEditDialog(cashier)}
                      >
                        <PencilLineIcon data-icon='inline-start' />
                        Editar
                      </Button>
                      {cashier.status === 'ACTIVE' ? (
                        <Button
                          variant='destructive'
                          size='sm'
                          onClick={() => onDisable(cashier.id)}
                        >
                          <UserX2Icon data-icon='inline-start' />
                          Deshabilitar
                        </Button>
                      ) : (
                        <Button
                          variant='outline'
                          size='sm'
                          onClick={() => onEnable(cashier.id)}
                        >
                          <CheckCircle2Icon data-icon='inline-start' />
                          Activar
                        </Button>
                      )}
                    </div>
                  </TableCell>
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
      </div>

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
              Actualiza nombre y usuario para este cajero.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={updateForm.handleSubmit(onUpdate)}
            className='flex flex-col gap-4'
          >
            <FieldGroup>
              <Field data-invalid={Boolean(updateForm.formState.errors.name)}>
                <FieldLabel htmlFor='edit-name'>Nombre</FieldLabel>
                <FieldContent>
                  <Input
                    id='edit-name'
                    aria-invalid={Boolean(updateForm.formState.errors.name)}
                    {...updateForm.register('name')}
                  />
                  <FieldError errors={[updateForm.formState.errors.name]} />
                </FieldContent>
              </Field>
              <Field
                data-invalid={Boolean(updateForm.formState.errors.username)}
              >
                <FieldLabel htmlFor='edit-username'>Usuario</FieldLabel>
                <FieldContent>
                  <Input
                    id='edit-username'
                    aria-invalid={Boolean(updateForm.formState.errors.username)}
                    {...updateForm.register('username')}
                  />
                  <FieldError errors={[updateForm.formState.errors.username]} />
                </FieldContent>
              </Field>
              <Field
                data-invalid={Boolean(updateForm.formState.errors.password)}
              >
                <FieldLabel htmlFor='edit-password'>Nueva password</FieldLabel>
                <FieldContent>
                  <Input
                    id='edit-password'
                    type='password'
                    aria-invalid={Boolean(updateForm.formState.errors.password)}
                    {...updateForm.register('password')}
                  />
                  <p className='text-xs text-muted-foreground'>
                    Deja este campo vacio para conservar la password actual.
                  </p>
                  <FieldError errors={[updateForm.formState.errors.password]} />
                </FieldContent>
              </Field>
            </FieldGroup>

            <DialogFooter>
              <Button type='submit' disabled={updateCashier.isPending}>
                {updateCashier.isPending ? 'Guardando...' : 'Actualizar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(assigningCashier)}
        onOpenChange={(open) => {
          if (!open) {
            setAssigningCashier(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Asociar landings</DialogTitle>
            <DialogDescription>
              Define 0 o mas landings para el cajero seleccionado.
            </DialogDescription>
          </DialogHeader>
          <div className='flex max-h-[320px] flex-col gap-3 overflow-y-auto rounded-lg border p-3'>
            {landings.map((landing) => (
              <label
                key={landing.id}
                className='flex items-start gap-3 rounded-md border p-3'
              >
                <Checkbox
                  checked={selectedLandingIds.includes(landing.id)}
                  onCheckedChange={() => toggleLandingSelection(landing.id)}
                />
                <div className='min-w-0'>
                  <p className='truncate text-sm font-medium'>{landing.url}</p>
                  <p className='text-xs text-muted-foreground'>
                    Pixel: {landing.metaPixelId}
                  </p>
                </div>
                <Badge
                  variant={landing.status === 'ACTIVE' ? 'default' : 'outline'}
                >
                  {landing.status === 'ACTIVE' ? 'Activa' : 'Deshabilitada'}
                </Badge>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button
              onClick={saveLandingAssociation}
              disabled={replaceCashierLandings.isPending}
            >
              {replaceCashierLandings.isPending
                ? 'Guardando...'
                : 'Guardar asociaciones'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
};
