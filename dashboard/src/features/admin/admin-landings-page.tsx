import { useState } from "react";
import { z } from "zod";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import {
  MoreHorizontalIcon,
  PencilLineIcon,
  PhoneIcon,
  PlusIcon,
  Trash2Icon,
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
  FieldDescription,
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
import type { Landing, LandingFallbackPhone } from "@/types/domain";
import { formatDateTime } from "@/lib/format";
import {
  useCreateLanding,
  useCreateLandingFallbackPhone,
  useDeleteLandingFallbackPhone,
  useLandingFallbackPhones,
  useLandings,
  useSetLandingStatus,
  useUpdateLanding,
  useUpdateLandingFallbackPhone,
} from "@/features/admin/admin-hooks";
import { PaginationControls } from "@/components/common/pagination-controls";

// ---------------------------------------------------------------------------
// Zod schemas — B8.5
// ---------------------------------------------------------------------------

const PHONE_REGEX = /^\+?[0-9]{8,15}$/;

const fallbackPhoneSchema = z.object({
  phone: z
    .string()
    .regex(PHONE_REGEX, "Formato inválido (8–15 dígitos, + opcional)"),
  label: z.string().optional(),
  order: z.number().int().nonnegative().optional(),
});

const createSchema = z.object({
  url: z.string().url("URL invalida"),
  metaPixelId: z.string().min(1, "Meta Pixel ID obligatorio"),
  metaAccessToken: z.string().min(1, "Meta Access Token obligatorio"),
  fallbackPhones: z
    .array(fallbackPhoneSchema)
    .min(1, "Agregá al menos un teléfono de respaldo"),
});

const updateSchema = z.object({
  url: z.string().url("URL invalida"),
  metaPixelId: z.string().min(1, "Meta Pixel ID obligatorio"),
  metaAccessToken: z.string().optional(),
});

type CreateValues = z.infer<typeof createSchema>;
type UpdateValues = z.infer<typeof updateSchema>;

const shortMaskedToken = (masked: string): string => `••••${masked.slice(-4)}`;

// ---------------------------------------------------------------------------
// FallbackPhoneSection — shared sub-form for create/edit dialogs (B8.6)
// ---------------------------------------------------------------------------

type FallbackPhoneSectionProps = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: ReturnType<typeof useForm<any>>;
  fieldArrayName: string;
};

const FallbackPhoneSection = ({ form, fieldArrayName }: FallbackPhoneSectionProps) => {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: fieldArrayName,
  });

  const errors = form.formState.errors[fieldArrayName] as
    | Array<{ phone?: { message?: string }; label?: { message?: string } } | undefined>
    | { message?: string }
    | undefined;

  const rootError =
    errors && !Array.isArray(errors) && typeof errors === "object" && "message" in errors
      ? (errors as { message?: string }).message
      : undefined;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Teléfonos de respaldo</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append({ phone: "", label: "" })}
        >
          <PlusIcon data-icon="inline-start" />
          Agregar
        </Button>
      </div>

      {rootError && (
        <p role="alert" className="text-sm text-destructive">
          {rootError}
        </p>
      )}

      {fields.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Agregá al menos un teléfono de respaldo antes de guardar.
        </p>
      )}

      {fields.map((field, index) => {
        const rowErrors = Array.isArray(errors) ? errors[index] : undefined;
        return (
          <div key={field.id} className="flex items-start gap-2">
            <div className="flex flex-1 flex-col gap-1">
              <Field data-invalid={Boolean(rowErrors?.phone)}>
                <FieldContent>
                  <Input
                    placeholder="+5491123456789"
                    aria-label={`Teléfono de respaldo ${index + 1}`}
                    aria-invalid={Boolean(rowErrors?.phone)}
                    {...form.register(`${fieldArrayName}.${index}.phone`)}
                  />
                  {rowErrors?.phone && (
                    <FieldError errors={[rowErrors.phone]} />
                  )}
                </FieldContent>
              </Field>
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <Field>
                <FieldContent>
                  <Input
                    placeholder="Etiqueta (opcional)"
                    aria-label={`Etiqueta del respaldo ${index + 1}`}
                    {...form.register(`${fieldArrayName}.${index}.label`)}
                  />
                </FieldContent>
              </Field>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Eliminar respaldo ${index + 1}`}
              onClick={() => remove(index)}
            >
              <Trash2Icon className="size-4 text-destructive" />
            </Button>
          </div>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// FallbackPhonesPanel — per-row expandable panel (B8.7)
// ---------------------------------------------------------------------------

type FallbackPhonesPanelProps = {
  landing: Landing;
};

const FallbackPhonesPanel = ({ landing }: FallbackPhonesPanelProps) => {
  const { data: phones = [], isLoading } = useLandingFallbackPhones(landing.id);
  const createPhone = useCreateLandingFallbackPhone(landing.id);
  const updatePhone = useUpdateLandingFallbackPhone(landing.id);
  const deletePhone = useDeleteLandingFallbackPhone(landing.id);

  const [addPhone, setAddPhone] = useState("");
  const [addLabel, setAddLabel] = useState("");
  const [addPhoneError, setAddPhoneError] = useState("");
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPhone, setEditPhone] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editPhoneError, setEditPhoneError] = useState("");

  const isLastFallbackError = (err: unknown): boolean => {
    if (!err || typeof err !== "object") return false;
    const e = err as { response?: { status?: number; data?: { error?: string } } };
    return e.response?.status === 409 && e.response?.data?.error === "LAST_FALLBACK";
  };

  const handleAdd = async () => {
    if (!PHONE_REGEX.test(addPhone)) {
      setAddPhoneError("Formato inválido (8–15 dígitos, + opcional)");
      return;
    }
    setAddPhoneError("");
    try {
      await createPhone.mutateAsync({ phone: addPhone, label: addLabel || undefined });
      setAddPhone("");
      setAddLabel("");
      toast.success("Teléfono de respaldo agregado");
    } catch {
      toast.error("No se pudo agregar el teléfono de respaldo");
    }
  };

  const handleDelete = async (phone: LandingFallbackPhone) => {
    setDeleteErrors((prev) => ({ ...prev, [phone.id]: "" }));
    try {
      await deletePhone.mutateAsync(phone.id);
      toast.success("Teléfono eliminado");
    } catch (err) {
      if (isLastFallbackError(err)) {
        setDeleteErrors((prev) => ({
          ...prev,
          [phone.id]: "Debes agregar otro respaldo antes de eliminar este",
        }));
      } else {
        toast.error("No se pudo eliminar el teléfono de respaldo");
      }
    }
  };

  const startEdit = (phone: LandingFallbackPhone) => {
    setEditingId(phone.id);
    setEditPhone(phone.phone);
    setEditLabel(phone.label ?? "");
    setEditPhoneError("");
  };

  const handleUpdate = async (id: string) => {
    if (!PHONE_REGEX.test(editPhone)) {
      setEditPhoneError("Formato inválido (8–15 dígitos, + opcional)");
      return;
    }
    setEditPhoneError("");
    try {
      await updatePhone.mutateAsync({
        id,
        patch: { phone: editPhone, label: editLabel || null },
      });
      setEditingId(null);
      toast.success("Teléfono actualizado");
    } catch {
      toast.error("No se pudo actualizar el teléfono de respaldo");
    }
  };

  if (isLoading) {
    return (
      <div className="px-4 pb-3 pt-2 text-sm text-muted-foreground">
        Cargando teléfonos de respaldo...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-4 pb-4 pt-2">
      {/* List of existing fallback phones */}
      {phones.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay teléfonos de respaldo registrados.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {phones.map((phone) => (
            <div key={phone.id} className="flex flex-col gap-1">
              {editingId === phone.id ? (
                <div className="flex items-start gap-2">
                  <div className="flex flex-1 flex-col gap-1">
                    <Input
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="+5491123456789"
                      aria-label="Teléfono editado"
                      aria-invalid={Boolean(editPhoneError)}
                    />
                    {editPhoneError && (
                      <p role="alert" className="text-sm text-destructive">
                        {editPhoneError}
                      </p>
                    )}
                  </div>
                  <Input
                    className="flex-1"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    placeholder="Etiqueta (opcional)"
                    aria-label="Etiqueta editada"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleUpdate(phone.id)}
                    disabled={updatePhone.isPending}
                  >
                    Guardar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingId(null)}
                  >
                    Cancelar
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="flex-1 font-mono text-sm">{phone.phone}</span>
                  {phone.label && (
                    <span className="text-sm text-muted-foreground">{phone.label}</span>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Editar teléfono de respaldo"
                    onClick={() => startEdit(phone)}
                  >
                    <PencilLineIcon className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Eliminar teléfono de respaldo"
                    onClick={() => handleDelete(phone)}
                    disabled={deletePhone.isPending}
                  >
                    <Trash2Icon className="size-3.5 text-destructive" />
                  </Button>
                </div>
              )}

              {/* Delete-last error inline — REQ-4 */}
              {deleteErrors[phone.id] && (
                <p role="alert" className="text-xs text-destructive">
                  {deleteErrors[phone.id]}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add new fallback phone inline form */}
      <div className="flex flex-col gap-1 border-t pt-3">
        <p className="text-xs font-medium text-muted-foreground">Agregar respaldo</p>
        <div className="flex items-start gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <Input
              value={addPhone}
              onChange={(e) => {
                setAddPhone(e.target.value);
                if (addPhoneError) setAddPhoneError("");
              }}
              placeholder="+5491123456789"
              aria-label="Teléfono de respaldo nuevo"
              aria-invalid={Boolean(addPhoneError)}
            />
            {addPhoneError && (
              <p role="alert" className="text-xs text-destructive">
                {addPhoneError}
              </p>
            )}
          </div>
          <Input
            className="flex-1"
            value={addLabel}
            onChange={(e) => setAddLabel(e.target.value)}
            placeholder="Etiqueta (opcional)"
            aria-label="Etiqueta del nuevo respaldo"
          />
          <Button
            type="button"
            size="sm"
            disabled={!addPhone || createPhone.isPending}
            onClick={handleAdd}
          >
            Agregar
          </Button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export const AdminLandingsPage = () => {
  const { data: landings = [], isLoading } = useLandings();
  const createLanding = useCreateLanding();
  const updateLanding = useUpdateLanding();
  const setLandingStatus = useSetLandingStatus();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingLanding, setEditingLanding] = useState<Landing | null>(null);
  const [fallbacksLanding, setFallbacksLanding] = useState<Landing | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const createForm = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      url: "",
      metaPixelId: "",
      metaAccessToken: "",
      fallbackPhones: [],
    },
  });

  const updateForm = useForm<UpdateValues>({
    resolver: zodResolver(updateSchema),
    defaultValues: {
      url: "",
      metaPixelId: "",
      metaAccessToken: "",
    },
  });

  const onCreate = async (values: CreateValues) => {
    try {
      await createLanding.mutateAsync({
        url: values.url,
        metaPixelId: values.metaPixelId,
        metaAccessToken: values.metaAccessToken,
        fallbackPhones: values.fallbackPhones,
      });
      toast.success("Landing creada");
      createForm.reset();
      setCreateDialogOpen(false);
    } catch {
      toast.error("No se pudo crear la landing");
    }
  };

  const onUpdate = async (values: UpdateValues) => {
    if (!editingLanding) {
      return;
    }

    const payload = {
      url: values.url,
      metaPixelId: values.metaPixelId,
      ...(values.metaAccessToken ? { metaAccessToken: values.metaAccessToken } : {}),
    };

    try {
      await updateLanding.mutateAsync({
        landingId: editingLanding.id,
        input: payload,
      });
      toast.success("Landing actualizada");
      setEditingLanding(null);
    } catch {
      toast.error("No se pudo actualizar la landing");
    }
  };

  const toggleLanding = async (landing: Landing) => {
    try {
      await setLandingStatus.mutateAsync({
        landingId: landing.id,
        enabled: landing.status !== "ACTIVE",
      });
      toast.success(
        landing.status === "ACTIVE"
          ? "Landing deshabilitada"
          : "Landing habilitada",
      );
    } catch {
      toast.error("No se pudo actualizar el estado");
    }
  };

  const openEditDialog = (landing: Landing) => {
    setEditingLanding(landing);
    updateForm.reset({
      url: landing.url,
      metaPixelId: landing.metaPixelId,
      metaAccessToken: "",
    });
  };

  const totalPages = Math.max(1, Math.ceil(landings.length / pageSize));
  const normalizedPage = Math.min(page, totalPages);
  const start = (normalizedPage - 1) * pageSize;
  const paginatedLandings = landings.slice(start, start + pageSize);

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        title="Gestion de landings"
        description="Crea, edita y habilita/deshabilita landings disponibles para asignacion."
        actions={
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger render={<Button />}>
              <PlusIcon data-icon="inline-start" />
              Nueva landing
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Crear landing</DialogTitle>
                <DialogDescription>
                  Define URL, Pixel ID, Access Token y al menos un teléfono de respaldo.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={createForm.handleSubmit(onCreate)} className="flex flex-col gap-4">
                <FieldGroup>
                  <Field data-invalid={Boolean(createForm.formState.errors.url)}>
                    <FieldLabel htmlFor="create-landing-url">URL</FieldLabel>
                    <FieldContent>
                      <Input
                        id="create-landing-url"
                        aria-invalid={Boolean(createForm.formState.errors.url)}
                        {...createForm.register("url")}
                      />
                      <FieldError errors={[createForm.formState.errors.url]} />
                    </FieldContent>
                  </Field>

                  <Field data-invalid={Boolean(createForm.formState.errors.metaPixelId)}>
                    <FieldLabel htmlFor="create-landing-pixel">Meta Pixel ID</FieldLabel>
                    <FieldContent>
                      <Input
                        id="create-landing-pixel"
                        aria-invalid={Boolean(createForm.formState.errors.metaPixelId)}
                        {...createForm.register("metaPixelId")}
                      />
                      <FieldError errors={[createForm.formState.errors.metaPixelId]} />
                    </FieldContent>
                  </Field>

                  <Field data-invalid={Boolean(createForm.formState.errors.metaAccessToken)}>
                    <FieldLabel htmlFor="create-landing-token">Meta Access Token</FieldLabel>
                    <FieldContent>
                      <Input
                        id="create-landing-token"
                        type="password"
                        aria-invalid={Boolean(createForm.formState.errors.metaAccessToken)}
                        {...createForm.register("metaAccessToken")}
                      />
                      <FieldError errors={[createForm.formState.errors.metaAccessToken]} />
                    </FieldContent>
                  </Field>
                </FieldGroup>

                {/* B8.6 — Fallback phones section */}
                <div className="rounded-lg border p-3">
                  <FallbackPhoneSection form={createForm} fieldArrayName="fallbackPhones" />
                </div>

                <DialogFooter>
                  <Button
                    type="submit"
                    disabled={
                      createLanding.isPending ||
                      createForm.watch("fallbackPhones").length === 0
                    }
                  >
                    {createLanding.isPending ? "Guardando..." : "Guardar landing"}
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
              <TableHead>URL</TableHead>
              <TableHead>Meta Pixel ID</TableHead>
              <TableHead>Meta Access Token</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Actualizada</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6}>Cargando landings...</TableCell>
              </TableRow>
            ) : landings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>No hay landings registradas.</TableCell>
              </TableRow>
            ) : (
              paginatedLandings.map((landing) => (
                  <TableRow key={landing.id}>
                    <TableCell>{landing.url}</TableCell>
                    <TableCell>{landing.metaPixelId}</TableCell>
                    <TableCell>
                      <span
                        className="font-mono text-xs"
                        title={landing.metaAccessTokenMasked}
                      >
                        {shortMaskedToken(landing.metaAccessTokenMasked)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={landing.status === "ACTIVE" ? "default" : "outline"}>
                        {landing.status === "ACTIVE" ? "Activa" : "Deshabilitada"}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDateTime(landing.updatedAt)}</TableCell>
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
                                  onClick={() => openEditDialog(landing)}
                                >
                                  <PencilLineIcon className="size-4" />
                                  Editar
                                </MenuPrimitive.Item>
                                <MenuPrimitive.Item
                                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 outline-none transition-colors hover:bg-accent hover:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                                  onClick={() => setFallbacksLanding(landing)}
                                >
                                  <PhoneIcon className="size-4" />
                                  Números de respaldo
                                </MenuPrimitive.Item>
                                <MenuPrimitive.Item
                                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 outline-none transition-colors hover:bg-accent hover:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                                  onClick={() => toggleLanding(landing)}
                                >
                                  {landing.status === "ACTIVE" ? (
                                    <ToggleLeftIcon className="size-4" />
                                  ) : (
                                    <ToggleRightIcon className="size-4" />
                                  )}
                                  {landing.status === "ACTIVE" ? "Deshabilitar" : "Habilitar"}
                                </MenuPrimitive.Item>
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
        <div className="mt-3">
          <PaginationControls
            page={normalizedPage}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </div>
      </div>

      {/* Edit landing dialog */}
      <Dialog
        open={Boolean(editingLanding)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingLanding(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar landing</DialogTitle>
            <DialogDescription>
              Editá URL, Pixel ID o token. Los teléfonos de respaldo se gestionan desde la
              acción "Números de respaldo".
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={updateForm.handleSubmit(onUpdate)} className="flex flex-col gap-4">
            <FieldGroup>
              <Field data-invalid={Boolean(updateForm.formState.errors.url)}>
                <FieldLabel htmlFor="edit-landing-url">URL</FieldLabel>
                <FieldContent>
                  <Input
                    id="edit-landing-url"
                    aria-invalid={Boolean(updateForm.formState.errors.url)}
                    {...updateForm.register("url")}
                  />
                  <FieldError errors={[updateForm.formState.errors.url]} />
                </FieldContent>
              </Field>

              <Field data-invalid={Boolean(updateForm.formState.errors.metaPixelId)}>
                <FieldLabel htmlFor="edit-landing-pixel">Meta Pixel ID</FieldLabel>
                <FieldContent>
                  <Input
                    id="edit-landing-pixel"
                    aria-invalid={Boolean(updateForm.formState.errors.metaPixelId)}
                    {...updateForm.register("metaPixelId")}
                  />
                  <FieldError errors={[updateForm.formState.errors.metaPixelId]} />
                </FieldContent>
              </Field>

              <Field data-invalid={Boolean(updateForm.formState.errors.metaAccessToken)}>
                <FieldLabel htmlFor="edit-landing-token">Nuevo Meta Access Token</FieldLabel>
                <FieldContent>
                  <Input
                    id="edit-landing-token"
                    type="password"
                    aria-invalid={Boolean(updateForm.formState.errors.metaAccessToken)}
                    {...updateForm.register("metaAccessToken")}
                  />
                  <FieldDescription>
                    Opcional. Solo completalo si queres reemplazar el token actual.
                  </FieldDescription>
                  <FieldError errors={[updateForm.formState.errors.metaAccessToken]} />
                </FieldContent>
              </Field>
            </FieldGroup>

            <DialogFooter>
              <Button
                type="submit"
                disabled={updateLanding.isPending}
              >
                {updateLanding.isPending ? "Guardando..." : "Actualizar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Fallback phones dialog */}
      <Dialog
        open={Boolean(fallbacksLanding)}
        onOpenChange={(open) => {
          if (!open) {
            setFallbacksLanding(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Números de respaldo</DialogTitle>
            <DialogDescription>
              Gestioná los teléfonos de respaldo asociados a esta landing.
            </DialogDescription>
          </DialogHeader>
          {fallbacksLanding && <FallbackPhonesPanel landing={fallbacksLanding} />}
        </DialogContent>
      </Dialog>
    </section>
  );
};
