import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import {
  MoreHorizontalIcon,
  PencilLineIcon,
  PlusIcon,
  ToggleLeftIcon,
  ToggleRightIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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
import type { AdminListItem } from "@/types/domain";
import { formatDateTime } from "@/lib/format";
import { useAuth } from "@/features/auth/auth-context";
import {
  useAdminsList,
  useCreateAdmin,
  useSetAdminStatus,
  useUpdateAdmin,
} from "@/features/admin-management/admin-management-hooks";

// Create admin schema
const createAdminSchema = z.object({
  name: z.string().min(1, "Nombre obligatorio"),
  username: z.string().min(1, "Usuario obligatorio"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

type CreateAdminValues = z.infer<typeof createAdminSchema>;

// Edit admin schema — all fields optional, at least one required
const editAdminSchema = z
  .object({
    name: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
  })
  .refine((v) => Boolean(v.name || v.username || v.password), {
    message: "Al menos un campo es requerido",
    path: ["name"],
  });

type EditAdminValues = z.infer<typeof editAdminSchema>;

export const AdminManagementPage = () => {
  const { user } = useAuth();
  const { data: admins = [], isLoading } = useAdminsList();
  const createAdmin = useCreateAdmin();
  const updateAdmin = useUpdateAdmin();
  const setAdminStatus = useSetAdminStatus();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<AdminListItem | null>(null);
  const [confirmStatusAdmin, setConfirmStatusAdmin] = useState<AdminListItem | null>(null);

  const createForm = useForm<CreateAdminValues>({
    resolver: zodResolver(createAdminSchema),
    defaultValues: { name: "", username: "", password: "" },
  });

  const editForm = useForm<EditAdminValues>({
    resolver: zodResolver(editAdminSchema),
    defaultValues: { name: "", username: "", password: "" },
  });

  const onCreate = async (values: CreateAdminValues) => {
    try {
      await createAdmin.mutateAsync(values);
      toast.success("Admin creado");
      createForm.reset();
      setCreateDialogOpen(false);
    } catch (error: unknown) {
      const status =
        error && typeof error === "object" && "response" in error
          ? (error as { response?: { status?: number } }).response?.status
          : undefined;
      if (status === 409) {
        createForm.setError("username", { message: "El usuario ya existe" });
      } else {
        toast.error("No se pudo crear el admin");
      }
    }
  };

  const onEdit = async (values: EditAdminValues) => {
    if (!editingAdmin) return;

    // Strip empty strings so server doesn't receive empty fields
    const patch: EditAdminValues = {};
    if (values.name) patch.name = values.name;
    if (values.username) patch.username = values.username;
    if (values.password) patch.password = values.password;

    try {
      await updateAdmin.mutateAsync({ adminId: editingAdmin.id, input: patch });
      toast.success("Admin actualizado");
      setEditingAdmin(null);
    } catch (error: unknown) {
      const status =
        error && typeof error === "object" && "response" in error
          ? (error as { response?: { status?: number } }).response?.status
          : undefined;
      if (status === 409) {
        editForm.setError("username", { message: "El usuario ya existe" });
      } else {
        toast.error("No se pudo actualizar el admin");
      }
    }
  };

  const openEditDialog = (admin: AdminListItem) => {
    setEditingAdmin(admin);
    editForm.reset({ name: admin.name, username: admin.username, password: "" });
  };

  const onConfirmStatus = async () => {
    if (!confirmStatusAdmin) return;
    const newStatus = confirmStatusAdmin.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    try {
      await setAdminStatus.mutateAsync({ adminId: confirmStatusAdmin.id, status: newStatus });
      toast.success(
        newStatus === "DISABLED" ? "Admin deshabilitado" : "Admin habilitado",
      );
      setConfirmStatusAdmin(null);
    } catch {
      toast.error("No se pudo actualizar el estado");
    }
  };

  const isSelf = (admin: AdminListItem) => admin.username === user?.username;

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        title="Gestion de admins"
        description="Crea, edita y habilita/deshabilita cuentas de administrador."
        actions={
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger render={<Button />}>
              <PlusIcon data-icon="inline-start" />
              Nuevo admin
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Crear admin</DialogTitle>
                <DialogDescription>
                  Crea una cuenta de administrador con acceso al dashboard.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={createForm.handleSubmit(onCreate)} className="flex flex-col gap-4">
                <FieldGroup>
                  <Field data-invalid={Boolean(createForm.formState.errors.name)}>
                    <FieldLabel htmlFor="create-admin-name">Nombre</FieldLabel>
                    <FieldContent>
                      <Input
                        id="create-admin-name"
                        aria-invalid={Boolean(createForm.formState.errors.name)}
                        {...createForm.register("name")}
                      />
                      <FieldError errors={[createForm.formState.errors.name]} />
                    </FieldContent>
                  </Field>

                  <Field data-invalid={Boolean(createForm.formState.errors.username)}>
                    <FieldLabel htmlFor="create-admin-username">Usuario</FieldLabel>
                    <FieldContent>
                      <Input
                        id="create-admin-username"
                        autoComplete="off"
                        aria-invalid={Boolean(createForm.formState.errors.username)}
                        {...createForm.register("username")}
                      />
                      <FieldError errors={[createForm.formState.errors.username]} />
                    </FieldContent>
                  </Field>

                  <Field data-invalid={Boolean(createForm.formState.errors.password)}>
                    <FieldLabel htmlFor="create-admin-password">Contraseña</FieldLabel>
                    <FieldContent>
                      <Input
                        id="create-admin-password"
                        type="password"
                        autoComplete="new-password"
                        aria-invalid={Boolean(createForm.formState.errors.password)}
                        {...createForm.register("password")}
                      />
                      <FieldError errors={[createForm.formState.errors.password]} />
                    </FieldContent>
                  </Field>
                </FieldGroup>

                <DialogFooter>
                  <Button type="submit" disabled={createAdmin.isPending}>
                    {createAdmin.isPending ? "Guardando..." : "Crear admin"}
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
              <TableHead>Rol</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Creado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6}>Cargando admins...</TableCell>
              </TableRow>
            ) : admins.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>No hay admins registrados.</TableCell>
              </TableRow>
            ) : (
              admins.map((admin) => (
                <TableRow key={admin.id}>
                  <TableCell>{admin.name}</TableCell>
                  <TableCell>@{admin.username}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {admin.role === "SUPER_ADMIN" ? "Super Admin" : "Admin"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={admin.status === "ACTIVE" ? "default" : "outline"}>
                      {admin.status === "ACTIVE" ? "Activo" : "Deshabilitado"}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDateTime(admin.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end">
                      <MenuPrimitive.Root>
                        <MenuPrimitive.Trigger
                          render={
                            <Button
                              variant="outline"
                              size="sm"
                              aria-label="Acciones"
                            />
                          }
                        >
                          <MoreHorizontalIcon className="size-4" />
                        </MenuPrimitive.Trigger>
                        <MenuPrimitive.Portal>
                          <MenuPrimitive.Positioner
                            sideOffset={4}
                            align="end"
                            className="z-50"
                          >
                            <MenuPrimitive.Popup
                              className={cn(
                                "min-w-[10rem] overflow-hidden rounded-lg bg-popover p-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none",
                                "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
                                "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
                              )}
                            >
                              <MenuPrimitive.Item
                                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 outline-none transition-colors hover:bg-accent hover:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                                onClick={() => openEditDialog(admin)}
                              >
                                <PencilLineIcon className="size-4" />
                                Editar
                              </MenuPrimitive.Item>
                              {!isSelf(admin) && (
                                <MenuPrimitive.Item
                                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 outline-none transition-colors hover:bg-accent hover:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                                  onClick={() => setConfirmStatusAdmin(admin)}
                                >
                                  {admin.status === "ACTIVE" ? (
                                    <ToggleLeftIcon className="size-4" />
                                  ) : (
                                    <ToggleRightIcon className="size-4" />
                                  )}
                                  {admin.status === "ACTIVE" ? "Deshabilitar" : "Habilitar"}
                                </MenuPrimitive.Item>
                              )}
                            </MenuPrimitive.Popup>
                          </MenuPrimitive.Positioner>
                        </MenuPrimitive.Portal>
                      </MenuPrimitive.Root>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Edit admin dialog */}
      <Dialog
        open={Boolean(editingAdmin)}
        onOpenChange={(open) => {
          if (!open) setEditingAdmin(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar admin</DialogTitle>
            <DialogDescription>
              Deja en blanco los campos que no quieras cambiar. Al menos un campo es requerido.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={editForm.handleSubmit(onEdit)} className="flex flex-col gap-4">
            <FieldGroup>
              <Field data-invalid={Boolean(editForm.formState.errors.name)}>
                <FieldLabel htmlFor="edit-admin-name">Nombre</FieldLabel>
                <FieldContent>
                  <Input
                    id="edit-admin-name"
                    aria-invalid={Boolean(editForm.formState.errors.name)}
                    {...editForm.register("name")}
                  />
                  <FieldError errors={[editForm.formState.errors.name]} />
                </FieldContent>
              </Field>

              <Field data-invalid={Boolean(editForm.formState.errors.username)}>
                <FieldLabel htmlFor="edit-admin-username">Usuario</FieldLabel>
                <FieldContent>
                  <Input
                    id="edit-admin-username"
                    autoComplete="off"
                    aria-invalid={Boolean(editForm.formState.errors.username)}
                    {...editForm.register("username")}
                  />
                  <FieldError errors={[editForm.formState.errors.username]} />
                </FieldContent>
              </Field>

              <Field data-invalid={Boolean(editForm.formState.errors.password)}>
                <FieldLabel htmlFor="edit-admin-password">Nueva contraseña</FieldLabel>
                <FieldContent>
                  <Input
                    id="edit-admin-password"
                    type="password"
                    autoComplete="new-password"
                    aria-invalid={Boolean(editForm.formState.errors.password)}
                    {...editForm.register("password")}
                  />
                  <FieldError errors={[editForm.formState.errors.password]} />
                </FieldContent>
              </Field>
            </FieldGroup>

            <DialogFooter>
              <Button type="submit" disabled={updateAdmin.isPending}>
                {updateAdmin.isPending ? "Guardando..." : "Actualizar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirm status change dialog */}
      <Dialog
        open={Boolean(confirmStatusAdmin)}
        onOpenChange={(open) => {
          if (!open) setConfirmStatusAdmin(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmStatusAdmin?.status === "ACTIVE"
                ? "Deshabilitar admin"
                : "Habilitar admin"}
            </DialogTitle>
            <DialogDescription>
              {confirmStatusAdmin?.status === "ACTIVE"
                ? `Deshabilitar a @${confirmStatusAdmin?.username}? Perdera acceso inmediatamente en la proxima solicitud.`
                : `Habilitar a @${confirmStatusAdmin?.username}? Recuperara acceso al dashboard.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmStatusAdmin(null)}
              disabled={setAdminStatus.isPending}
            >
              Cancelar
            </Button>
            <Button
              variant={confirmStatusAdmin?.status === "ACTIVE" ? "destructive" : "default"}
              onClick={onConfirmStatus}
              disabled={setAdminStatus.isPending}
            >
              {setAdminStatus.isPending
                ? "Actualizando..."
                : confirmStatusAdmin?.status === "ACTIVE"
                  ? "Deshabilitar"
                  : "Habilitar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
};
