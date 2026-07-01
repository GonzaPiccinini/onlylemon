import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LockIcon, PencilLineIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/status-badge";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { MetaPixel } from "@/types/domain";
import {
  useCreateMetaPixel,
  useDeleteMetaPixel,
  useMetaPixels,
  useUpdateMetaPixel,
} from "@/features/admin/admin-hooks";
import { ConfirmDialog } from "./confirm-dialog";
import {
  createPixelSchema,
  updatePixelSchema,
  type CreatePixelValues,
  type UpdatePixelValues,
} from "./schemas";

const pixelHasLeads = (p: MetaPixel) => p.leadCount > 0;

// ---------------------------------------------------------------------------
// Inline edit form for a single pixel row
// ---------------------------------------------------------------------------

const PixelEditForm = ({
  pixel,
  onDone,
}: {
  pixel: MetaPixel;
  onDone: () => void;
}) => {
  const updatePixel = useUpdateMetaPixel();
  const form = useForm<UpdatePixelValues>({
    resolver: zodResolver(updatePixelSchema),
    defaultValues: { pixelId: pixel.pixelId, accessToken: "", label: pixel.label ?? "" },
  });

  const frozen = pixelHasLeads(pixel);

  const onSubmit = async (values: UpdatePixelValues) => {
    const payload: { pixelId?: string; accessToken?: string; label?: string | null } = {};
    if (values.pixelId && values.pixelId !== pixel.pixelId) payload.pixelId = values.pixelId;
    if (values.accessToken) payload.accessToken = values.accessToken;
    if (values.label !== undefined) payload.label = values.label || null;

    if (Object.keys(payload).length === 0) {
      onDone();
      return;
    }

    try {
      await updatePixel.mutateAsync({ id: pixel.id, input: payload });
      toast.success("Pixel actualizado");
      onDone();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      if (e.response?.data?.error === "PIXEL_ID_FROZEN") {
        toast.error("El Pixel ID no puede editarse porque hay leads asociados.");
      } else {
        toast.error("No se pudo actualizar el pixel");
      }
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-3">
      <FieldGroup>
        <Field data-invalid={Boolean(form.formState.errors.pixelId)}>
          <FieldLabel htmlFor={`edit-pixel-id-${pixel.id}`}>
            Pixel ID
            {frozen && (
              <span
                title="Congelado: hay leads asociados"
                className="ml-1 inline-flex items-center gap-1 text-xs text-warning"
              >
                <LockIcon className="size-3" /> Congelado
              </span>
            )}
          </FieldLabel>
          <FieldContent>
            <Input
              id={`edit-pixel-id-${pixel.id}`}
              disabled={frozen}
              aria-invalid={Boolean(form.formState.errors.pixelId)}
              {...form.register("pixelId")}
            />
            {frozen && (
              <FieldDescription>
                Hay {pixel.leadCount} lead(s) asociados. El Pixel ID no puede modificarse para
                preservar la atribución histórica. Podés rotar el Access Token o editar la etiqueta.
              </FieldDescription>
            )}
            <FieldError errors={[form.formState.errors.pixelId]} />
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel htmlFor={`edit-access-token-${pixel.id}`}>Nuevo Access Token</FieldLabel>
          <FieldContent>
            <Input
              id={`edit-access-token-${pixel.id}`}
              type="password"
              placeholder="Dejá vacío para no cambiar"
              {...form.register("accessToken")}
            />
            <FieldDescription>
              Siempre editable. Dejalo vacío para mantener el token actual.
            </FieldDescription>
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel htmlFor={`edit-label-${pixel.id}`}>Etiqueta</FieldLabel>
          <FieldContent>
            <Input
              id={`edit-label-${pixel.id}`}
              placeholder="Nombre descriptivo (opcional)"
              {...form.register("label")}
            />
          </FieldContent>
        </Field>
      </FieldGroup>

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={updatePixel.isPending}>
          {updatePixel.isPending ? "Guardando…" : "Guardar"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
};

// ---------------------------------------------------------------------------
// Read-only pixel row
// ---------------------------------------------------------------------------

const PixelRow = ({
  pixel,
  onEdit,
  onRequestDelete,
  deleteError,
}: {
  pixel: MetaPixel;
  onEdit: () => void;
  onRequestDelete: () => void;
  deleteError?: string;
}) => {
  const frozen = pixelHasLeads(pixel);
  const label = pixel.label?.trim();
  const title = label || pixel.pixelId;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              title={title}
              className="min-w-0 truncate font-heading text-sm font-semibold text-foreground"
            >
              {title}
            </span>
            {frozen && (
              <StatusBadge variant="progress" icon={LockIcon}>
                Congelado
              </StatusBadge>
            )}
          </div>
          {label && (
            <span
              title={pixel.pixelId}
              className="truncate font-mono text-xs text-muted-foreground"
            >
              {pixel.pixelId}
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {pixel.landingCount} landing(s) · {pixel.leadCount} lead(s)
          </span>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Editar pixel"
            onClick={onEdit}
          >
            <PencilLineIcon className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Eliminar pixel"
            onClick={onRequestDelete}
          >
            <Trash2Icon className="size-3.5 text-destructive" />
          </Button>
        </div>
      </div>
      {deleteError && (
        <p role="alert" className="text-xs text-destructive">
          {deleteError}
        </p>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Create pixel inline form
// ---------------------------------------------------------------------------

const CreatePixelForm = ({ onDone }: { onDone: () => void }) => {
  const createPixel = useCreateMetaPixel();
  const form = useForm<CreatePixelValues>({
    resolver: zodResolver(createPixelSchema),
    defaultValues: { pixelId: "", accessToken: "", label: "" },
  });

  const onSubmit = async (values: CreatePixelValues) => {
    try {
      await createPixel.mutateAsync({
        pixelId: values.pixelId,
        accessToken: values.accessToken,
        label: values.label || undefined,
      });
      toast.success("Pixel creado");
      form.reset();
      onDone();
    } catch {
      toast.error("No se pudo crear el pixel");
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-3">
      <p className="text-sm font-medium">Nuevo pixel</p>
      <FieldGroup>
        <Field data-invalid={Boolean(form.formState.errors.pixelId)}>
          <FieldLabel htmlFor="new-pixel-id">Pixel ID</FieldLabel>
          <FieldContent>
            <Input
              id="new-pixel-id"
              placeholder="ej. 976916338006290"
              aria-invalid={Boolean(form.formState.errors.pixelId)}
              {...form.register("pixelId")}
            />
            <FieldError errors={[form.formState.errors.pixelId]} />
          </FieldContent>
        </Field>

        <Field data-invalid={Boolean(form.formState.errors.accessToken)}>
          <FieldLabel htmlFor="new-access-token">Access Token</FieldLabel>
          <FieldContent>
            <Input
              id="new-access-token"
              type="password"
              aria-invalid={Boolean(form.formState.errors.accessToken)}
              {...form.register("accessToken")}
            />
            <FieldError errors={[form.formState.errors.accessToken]} />
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel htmlFor="new-pixel-label">Etiqueta (opcional)</FieldLabel>
          <FieldContent>
            <Input id="new-pixel-label" placeholder="Nombre descriptivo" {...form.register("label")} />
          </FieldContent>
        </Field>
      </FieldGroup>

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={createPixel.isPending}>
          {createPixel.isPending ? "Guardando…" : "Crear pixel"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
};

// ---------------------------------------------------------------------------
// Pixels tab
// ---------------------------------------------------------------------------

export const PixelsPanel = () => {
  const { data: pixels = [], isLoading } = useMetaPixels();
  const deletePixel = useDeleteMetaPixel();

  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MetaPixel | null>(null);
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteErrors((prev) => ({ ...prev, [target.id]: "" }));
    try {
      await deletePixel.mutateAsync(target.id);
      toast.success("Pixel eliminado");
      setDeleteTarget(null);
    } catch (err) {
      const e = err as {
        response?: {
          data?: { error?: string; references?: { leads: number; landings: number } };
        };
      };
      if (e.response?.data?.error === "PIXEL_REFERENCED") {
        const refs = e.response.data.references;
        const msg = refs
          ? `No se puede eliminar: ${refs.landings} landing(s) y ${refs.leads} lead(s) lo referencian.`
          : "No se puede eliminar: el pixel tiene referencias activas.";
        setDeleteErrors((prev) => ({ ...prev, [target.id]: msg }));
      } else {
        toast.error("No se pudo eliminar el pixel");
      }
      setDeleteTarget(null);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex items-center justify-end gap-3">
        {!creating && (
          <Button type="button" size="sm" onClick={() => setCreating(true)}>
            <PlusIcon data-icon="inline-start" />
            Nuevo pixel
          </Button>
        )}
      </div>

      {creating && (
        <div className="rounded-xl glass-subtle p-4">
          <CreatePixelForm onDone={() => setCreating(false)} />
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      ) : pixels.length === 0 ? (
        <p className="rounded-xl glass-subtle p-6 text-center text-sm text-muted-foreground">
          No hay pixels registrados todavía.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {pixels.map((pixel) => (
            <div key={pixel.id} className="rounded-xl glass-subtle p-4">
              {editingId === pixel.id ? (
                <PixelEditForm pixel={pixel} onDone={() => setEditingId(null)} />
              ) : (
                <PixelRow
                  pixel={pixel}
                  onEdit={() => setEditingId(pixel.id)}
                  onRequestDelete={() => setDeleteTarget(pixel)}
                  deleteError={deleteErrors[pixel.id]}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Eliminar pixel"
        description={
          deleteTarget
            ? `¿Eliminar el pixel ${deleteTarget.label || deleteTarget.pixelId}? Esta acción no se puede deshacer.`
            : ""
        }
        onConfirm={confirmDelete}
        pending={deletePixel.isPending}
      />
    </div>
  );
};
