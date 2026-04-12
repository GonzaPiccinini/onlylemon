import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PencilLineIcon, PlusIcon, ToggleLeftIcon, ToggleRightIcon } from "lucide-react";
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
import type { Landing } from "@/types/domain";
import { formatDateTime } from "@/lib/format";
import {
  useCreateLanding,
  useLandings,
  useSetLandingStatus,
  useUpdateLanding,
} from "@/features/admin/admin-hooks";
import { PaginationControls } from "@/components/common/pagination-controls";

const createSchema = z.object({
  url: z.string().url("URL invalida"),
  metaPixelId: z.string().min(1, "Meta Pixel ID obligatorio"),
  metaAccessToken: z.string().min(1, "Meta Access Token obligatorio"),
});

const updateSchema = z.object({
  url: z.string().url("URL invalida"),
  metaPixelId: z.string().min(1, "Meta Pixel ID obligatorio"),
  metaAccessToken: z.string().optional(),
});

type CreateValues = z.infer<typeof createSchema>;
type UpdateValues = z.infer<typeof updateSchema>;

export const AdminLandingsPage = () => {
  const { data: landings = [], isLoading } = useLandings();
  const createLanding = useCreateLanding();
  const updateLanding = useUpdateLanding();
  const setLandingStatus = useSetLandingStatus();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingLanding, setEditingLanding] = useState<Landing | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const createForm = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      url: "",
      metaPixelId: "",
      metaAccessToken: "",
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
      await createLanding.mutateAsync(values);
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
      ...values,
      ...(values.metaAccessToken ? {} : { metaAccessToken: undefined }),
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
                  Define URL, Pixel ID y Access Token para la landing.
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

                <DialogFooter>
                  <Button type="submit" disabled={createLanding.isPending}>
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
                  <TableCell>{landing.metaAccessTokenMasked}</TableCell>
                  <TableCell>
                    <Badge variant={landing.status === "ACTIVE" ? "default" : "outline"}>
                      {landing.status === "ACTIVE" ? "Activa" : "Deshabilitada"}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDateTime(landing.updatedAt)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEditDialog(landing)}>
                        <PencilLineIcon data-icon="inline-start" />
                        Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleLanding(landing)}
                      >
                        {landing.status === "ACTIVE" ? (
                          <ToggleLeftIcon data-icon="inline-start" />
                        ) : (
                          <ToggleRightIcon data-icon="inline-start" />
                        )}
                        {landing.status === "ACTIVE" ? "Deshabilitar" : "Habilitar"}
                      </Button>
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
              Si dejas vacio el token, se conserva el token actual.
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
              <Button type="submit" disabled={updateLanding.isPending}>
                {updateLanding.isPending ? "Guardando..." : "Actualizar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
};
