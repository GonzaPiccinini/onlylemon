import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PencilLineIcon, PlusIcon, UserX2Icon } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Cashier } from "@/types/domain";
import { formatDateTime } from "@/lib/format";
import {
  useAdminCashiers,
  useCreateCashier,
  useDisableCashier,
  useUpdateCashier,
} from "@/features/admin/admin-hooks";

const createSchema = z.object({
  name: z.string().min(2, "Nombre obligatorio"),
  username: z.string().min(3, "Usuario obligatorio"),
  password: z.string().min(6, "Minimo 6 caracteres"),
});

const updateSchema = z.object({
  name: z.string().min(2, "Nombre obligatorio"),
  username: z.string().min(3, "Usuario obligatorio"),
});

type CreateValues = z.infer<typeof createSchema>;
type UpdateValues = z.infer<typeof updateSchema>;

export const AdminCashiersPage = () => {
  const { data: cashiers = [], isLoading } = useAdminCashiers();
  const createCashier = useCreateCashier();
  const disableCashier = useDisableCashier();
  const updateCashier = useUpdateCashier();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingCashier, setEditingCashier] = useState<Cashier | null>(null);

  const createForm = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      name: "",
      username: "",
      password: "",
    },
  });

  const updateForm = useForm<UpdateValues>({
    resolver: zodResolver(updateSchema),
    defaultValues: {
      name: "",
      username: "",
    },
  });

  const onCreate = async (values: CreateValues) => {
    try {
      await createCashier.mutateAsync(values);
      toast.success("Cajero creado");
      createForm.reset();
      setCreateDialogOpen(false);
    } catch {
      toast.error("No se pudo crear el cajero");
    }
  };

  const onUpdate = async (values: UpdateValues) => {
    if (!editingCashier) {
      return;
    }

    try {
      await updateCashier.mutateAsync({
        cashierId: editingCashier.id,
        input: values,
      });
      toast.success("Cajero actualizado");
      setEditingCashier(null);
    } catch {
      toast.error("No se pudo actualizar el cajero");
    }
  };

  const onDisable = async (cashierId: string) => {
    try {
      await disableCashier.mutateAsync(cashierId);
      toast.success("Cajero deshabilitado");
    } catch {
      toast.error("No se pudo deshabilitar");
    }
  };

  const openEditDialog = (cashier: Cashier) => {
    setEditingCashier(cashier);
    updateForm.reset({
      name: cashier.name,
      username: cashier.username,
    });
  };

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
                  Completa los datos para habilitar la operacion de un nuevo cajero.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={createForm.handleSubmit(onCreate)} className="flex flex-col gap-4">
                <FieldGroup>
                  <Field data-invalid={Boolean(createForm.formState.errors.name)}>
                    <FieldLabel htmlFor="create-name">Nombre</FieldLabel>
                    <FieldContent>
                      <Input id="create-name" aria-invalid={Boolean(createForm.formState.errors.name)} {...createForm.register("name")} />
                      <FieldError errors={[createForm.formState.errors.name]} />
                    </FieldContent>
                  </Field>

                  <Field data-invalid={Boolean(createForm.formState.errors.username)}>
                    <FieldLabel htmlFor="create-username">Usuario</FieldLabel>
                    <FieldContent>
                      <Input id="create-username" aria-invalid={Boolean(createForm.formState.errors.username)} {...createForm.register("username")} />
                      <FieldError errors={[createForm.formState.errors.username]} />
                    </FieldContent>
                  </Field>

                  <Field data-invalid={Boolean(createForm.formState.errors.password)}>
                    <FieldLabel htmlFor="create-password">Password</FieldLabel>
                    <FieldContent>
                      <Input id="create-password" type="password" aria-invalid={Boolean(createForm.formState.errors.password)} {...createForm.register("password")} />
                      <FieldError errors={[createForm.formState.errors.password]} />
                    </FieldContent>
                  </Field>
                </FieldGroup>

                <DialogFooter>
                  <Button type="submit" disabled={createCashier.isPending}>
                    {createCashier.isPending ? "Guardando..." : "Guardar cajero"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="rounded-2xl border bg-card p-3 shadow-sm md:p-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Usuario</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Creado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5}>Cargando cajeros...</TableCell>
              </TableRow>
            ) : cashiers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5}>No hay cajeros registrados.</TableCell>
              </TableRow>
            ) : (
              cashiers.map((cashier) => (
                <TableRow key={cashier.id}>
                  <TableCell>{cashier.name}</TableCell>
                  <TableCell>{cashier.username}</TableCell>
                  <TableCell>
                    <Badge variant={cashier.status === "ACTIVE" ? "default" : "outline"}>
                      {cashier.status === "ACTIVE" ? "Activo" : "Deshabilitado"}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDateTime(cashier.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEditDialog(cashier)}>
                        <PencilLineIcon data-icon="inline-start" />
                        Editar
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={cashier.status === "DISABLED"}
                        onClick={() => onDisable(cashier.id)}
                      >
                        <UserX2Icon data-icon="inline-start" />
                        Deshabilitar
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
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
            <DialogDescription>Actualiza nombre y usuario para este cajero.</DialogDescription>
          </DialogHeader>
          <form onSubmit={updateForm.handleSubmit(onUpdate)} className="flex flex-col gap-4">
            <FieldGroup>
              <Field data-invalid={Boolean(updateForm.formState.errors.name)}>
                <FieldLabel htmlFor="edit-name">Nombre</FieldLabel>
                <FieldContent>
                  <Input id="edit-name" aria-invalid={Boolean(updateForm.formState.errors.name)} {...updateForm.register("name")} />
                  <FieldError errors={[updateForm.formState.errors.name]} />
                </FieldContent>
              </Field>
              <Field data-invalid={Boolean(updateForm.formState.errors.username)}>
                <FieldLabel htmlFor="edit-username">Usuario</FieldLabel>
                <FieldContent>
                  <Input id="edit-username" aria-invalid={Boolean(updateForm.formState.errors.username)} {...updateForm.register("username")} />
                  <FieldError errors={[updateForm.formState.errors.username]} />
                </FieldContent>
              </Field>
            </FieldGroup>

            <DialogFooter>
              <Button type="submit" disabled={updateCashier.isPending}>
                {updateCashier.isPending ? "Guardando..." : "Actualizar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
};
