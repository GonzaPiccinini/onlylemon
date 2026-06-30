import { useState } from "react";
import { z } from "zod";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CheckCircle2Icon,
  CheckIcon,
  CircleDashedIcon,
  Code2Icon,
  CopyIcon,
  LockIcon,
  MoreHorizontalIcon,
  PencilLineIcon,
  PhoneIcon,
  PlusIcon,
  RadioIcon,
  Trash2Icon,
  ToggleLeftIcon,
  ToggleRightIcon,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { TableRowsSkeleton } from "@/components/common/table-skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/common/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Landing, LandingFallbackPhone, MetaPixel } from "@/types/domain";
import { env } from "@/config/env";
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
  useMetaPixels,
  useCreateMetaPixel,
  useUpdateMetaPixel,
  useDeleteMetaPixel,
} from "@/features/admin/admin-hooks";
import { PaginationControls } from "@/components/common/pagination-controls";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_MESSAGES = 5;
const MAX_MSG_LEN = 250;

const PHONE_REGEX = /^\+?[0-9]{8,15}$/;

const pixelLabel = (p: Pick<MetaPixel, "pixelId" | "label">) =>
  p.label ? `${p.label} (${p.pixelId})` : p.pixelId;

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const fallbackPhoneSchema = z.object({
  phone: z
    .string()
    .regex(PHONE_REGEX, "Formato inválido (8–15 dígitos, + opcional)"),
  label: z.string().optional(),
  order: z.number().int().nonnegative().optional(),
});

const whatsappMessageItemSchema = z
  .string()
  .max(MAX_MSG_LEN, `Máximo ${MAX_MSG_LEN} caracteres`);

const whatsappMessagesSchema = z
  .array(whatsappMessageItemSchema)
  .max(MAX_MESSAGES, `Máximo ${MAX_MESSAGES} mensajes`);

const createSchema = z.object({
  url: z.string().url("URL invalida"),
  metaPixelRef: z.string().min(1, "Seleccioná un pixel"),
  whatsappMessages: whatsappMessagesSchema.optional(),
  fallbackPhones: z
    .array(fallbackPhoneSchema)
    .min(1, "Agregá al menos un teléfono de respaldo"),
});

const updateSchema = z.object({
  url: z.string().url("URL invalida"),
  metaPixelRef: z.string().min(1, "Seleccioná un pixel"),
  whatsappMessages: whatsappMessagesSchema,
});

const createPixelSchema = z.object({
  pixelId: z.string().min(1, "Pixel ID obligatorio"),
  accessToken: z.string().min(1, "Access Token obligatorio"),
  label: z.string().optional(),
});

const updatePixelSchema = z.object({
  pixelId: z.string().optional(),
  accessToken: z.string().optional(),
  label: z.string().optional(),
});

type CreateValues = z.infer<typeof createSchema>;
type UpdateValues = z.infer<typeof updateSchema>;
type CreatePixelValues = z.infer<typeof createPixelSchema>;
type UpdatePixelValues = z.infer<typeof updatePixelSchema>;

// ---------------------------------------------------------------------------
// WhatsappMessagesEditor — reusable list editor with client-side validation
// ---------------------------------------------------------------------------

type WhatsappMessagesEditorProps = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: ReturnType<typeof useForm<any>>;
  fieldArrayName: string;
};

const WhatsappMessagesEditor = ({ form, fieldArrayName }: WhatsappMessagesEditorProps) => {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: fieldArrayName,
  });

  const errors = form.formState.errors[fieldArrayName] as
    | Array<{ message?: string } | undefined>
    | { message?: string }
    | undefined;

  const rootError =
    errors && !Array.isArray(errors) && "message" in errors
      ? (errors as { message?: string }).message
      : undefined;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Mensajes de WhatsApp</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={fields.length >= MAX_MESSAGES}
          onClick={() => append("")}
        >
          <PlusIcon data-icon="inline-start" />
          Agregar
        </Button>
      </div>

      {rootError && (
        <p role="alert" className="text-sm text-destructive">{rootError}</p>
      )}

      {fields.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Sin mensajes configurados. Máximo {MAX_MESSAGES}.
        </p>
      )}

      {fields.map((field, index) => {
        const rowError = Array.isArray(errors) ? errors[index]?.message : undefined;
        const val: string = form.watch(`${fieldArrayName}.${index}`) ?? "";
        return (
          <div key={field.id} className="flex items-start gap-2">
            <div className="flex flex-1 flex-col gap-1">
              <Field data-invalid={Boolean(rowError)}>
                <FieldContent>
                  <Input
                    placeholder="Mensaje de bienvenida…"
                    aria-label={`Mensaje ${index + 1}`}
                    aria-invalid={Boolean(rowError)}
                    {...form.register(`${fieldArrayName}.${index}`)}
                  />
                  <span className="text-right text-xs text-muted-foreground">
                    {val.length}/{MAX_MSG_LEN}
                  </span>
                  {rowError && <FieldError errors={[{ message: rowError }]} />}
                </FieldContent>
              </Field>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Eliminar mensaje ${index + 1}`}
              onClick={() => remove(index)}
            >
              <Trash2Icon className="size-4 text-destructive" />
            </Button>
          </div>
        );
      })}

      <p className="text-xs text-muted-foreground">
        Cada mensaje se recorta y los vacíos se descartan al guardar. Máx {MAX_MSG_LEN} caracteres c/u.
      </p>
    </div>
  );
};

// ---------------------------------------------------------------------------
// FallbackPhoneSection — shared sub-form for create/edit dialogs
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
// FallbackPhonesPanel — per-row expandable panel
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
      <div className="flex flex-col gap-2 px-4 pb-3 pt-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-3/4" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-4 pb-4 pt-2">
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

              {deleteErrors[phone.id] && (
                <p role="alert" className="text-xs text-destructive">
                  {deleteErrors[phone.id]}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

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
// EmbedSnippetPanel — per-landing integration snippet with mode selector
// ---------------------------------------------------------------------------

type EmbedMode = "boton-flotante" | "widget-automontado" | "solo-logica";

const EMBED_MODES: { value: EmbedMode; label: string }[] = [
  { value: "boton-flotante", label: "Botón flotante (FAB)" },
  { value: "widget-automontado", label: "Widget automontado" },
  { value: "solo-logica", label: "Solo lógica (tu propio markup)" },
];

/** Strip the /api suffix from the dashboard API base URL to get the worker root. */
const workerBase = env.apiBaseUrl.replace(/\/api$/, "");

function buildSnippet(landingId: string, mode: EmbedMode): string {
  const scriptTag = `<script src="${workerBase}/embed/${landingId}.js" data-cta-mode="${mode}" async></script>`;

  if (mode === "boton-flotante") {
    return scriptTag;
  }

  if (mode === "widget-automontado") {
    return `<div id="cta-root"></div>\n${scriptTag}`;
  }

  // solo-logica: owner must provide a [data-cta] button and a [data-cta-captcha] container
  return [
    `<!-- Botón de CTA (atributo data-cta requerido) -->`,
    `<button type="button" data-cta>Contactarse</button>`,
    `<!-- Contenedor para el captcha (atributo data-cta-captcha requerido) -->`,
    `<div data-cta-captcha></div>`,
    scriptTag,
  ].join("\n");
}

type EmbedSnippetPanelProps = {
  landing: Landing;
};

const EmbedSnippetPanel = ({ landing }: EmbedSnippetPanelProps) => {
  const [mode, setMode] = useState<EmbedMode>("boton-flotante");
  const [copied, setCopied] = useState(false);

  const snippet = buildSnippet(landing.id, mode);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API not available in this context
    }
  };

  return (
    <div className="flex flex-col gap-4 px-1 pb-2 pt-1">
      <Field>
        <FieldLabel htmlFor={`embed-mode-${landing.id}`}>Modo de integración</FieldLabel>
        <FieldContent>
          <select
            id={`embed-mode-${landing.id}`}
            value={mode}
            onChange={(e) => setMode(e.target.value as EmbedMode)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {EMBED_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </FieldContent>
      </Field>

      {mode === "solo-logica" && (
        <p className="text-xs text-muted-foreground">
          Tu página debe incluir un elemento con el atributo{" "}
          <code className="rounded bg-muted px-1 font-mono">data-cta</code> (el botón
          que dispara el contacto) y un contenedor con el atributo{" "}
          <code className="rounded bg-muted px-1 font-mono">data-cta-captcha</code>{" "}
          (donde se muestra el captcha). El snippet incluye un ejemplo.
        </p>
      )}

      <div className="relative">
        <pre className="overflow-x-auto rounded-md bg-muted p-3 pr-10 text-xs font-mono leading-relaxed whitespace-pre-wrap break-all">
          {snippet}
        </pre>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute right-2 top-2"
          aria-label={copied ? "Copiado" : "Copiar snippet"}
          onClick={handleCopy}
        >
          {copied ? (
            <CheckIcon className="size-4 text-green-600" />
          ) : (
            <CopyIcon className="size-4" />
          )}
        </Button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// MetaPixelSelectorField — dropdown that lists available pixels
// ---------------------------------------------------------------------------

type MetaPixelSelectorFieldProps = {
  value: string;
  onChange: (id: string) => void;
  pixels: MetaPixel[];
  error?: string;
  id?: string;
};

const MetaPixelSelectorField = ({
  value,
  onChange,
  pixels,
  error,
  id,
}: MetaPixelSelectorFieldProps) => (
  <Field data-invalid={Boolean(error)}>
    <FieldLabel htmlFor={id}>Pixel de seguimiento</FieldLabel>
    <FieldContent>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        <option value="">— Seleccioná un pixel —</option>
        {pixels.map((p) => (
          <option key={p.id} value={p.id}>
            {pixelLabel(p)}
          </option>
        ))}
      </select>
      {error && <FieldError errors={[{ message: error }]} />}
    </FieldContent>
  </Field>
);

// ---------------------------------------------------------------------------
// MetaPixelManagementDialog — full CRUD with reference guards
// ---------------------------------------------------------------------------

const MetaPixelManagementDialog = () => {
  const { data: pixels = [], isLoading } = useMetaPixels();
  const createPixel = useCreateMetaPixel();
  const updatePixel = useUpdateMetaPixel();
  const deletePixel = useDeleteMetaPixel();

  const [createOpen, setCreateOpen] = useState(false);
  const [editingPixel, setEditingPixel] = useState<MetaPixel | null>(null);
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});

  const createForm = useForm<CreatePixelValues>({
    resolver: zodResolver(createPixelSchema),
    defaultValues: { pixelId: "", accessToken: "", label: "" },
  });

  const updateForm = useForm<UpdatePixelValues>({
    resolver: zodResolver(updatePixelSchema),
    defaultValues: { pixelId: "", accessToken: "", label: "" },
  });

  const onCreatePixel = async (values: CreatePixelValues) => {
    try {
      await createPixel.mutateAsync({
        pixelId: values.pixelId,
        accessToken: values.accessToken,
        label: values.label || undefined,
      });
      toast.success("Pixel creado");
      createForm.reset();
      setCreateOpen(false);
    } catch {
      toast.error("No se pudo crear el pixel");
    }
  };

  const openEditPixel = (p: MetaPixel) => {
    setEditingPixel(p);
    updateForm.reset({ pixelId: p.pixelId, accessToken: "", label: p.label ?? "" });
  };

  const onUpdatePixel = async (values: UpdatePixelValues) => {
    if (!editingPixel) return;

    const payload: { pixelId?: string; accessToken?: string; label?: string | null } = {};
    if (values.pixelId && values.pixelId !== editingPixel.pixelId) {
      payload.pixelId = values.pixelId;
    }
    if (values.accessToken) payload.accessToken = values.accessToken;
    if (values.label !== undefined) payload.label = values.label || null;

    if (Object.keys(payload).length === 0) {
      setEditingPixel(null);
      return;
    }

    try {
      await updatePixel.mutateAsync({ id: editingPixel.id, input: payload });
      toast.success("Pixel actualizado");
      setEditingPixel(null);
    } catch (err) {
      const e = err as { response?: { data?: { error?: string; message?: string } } };
      if (e.response?.data?.error === "PIXEL_ID_FROZEN") {
        toast.error("El Pixel ID no puede editarse porque hay leads asociados.");
      } else {
        toast.error("No se pudo actualizar el pixel");
      }
    }
  };

  const handleDeletePixel = async (p: MetaPixel) => {
    setDeleteErrors((prev) => ({ ...prev, [p.id]: "" }));
    try {
      await deletePixel.mutateAsync(p.id);
      toast.success("Pixel eliminado");
    } catch (err) {
      const e = err as {
        response?: {
          data?: {
            error?: string;
            message?: string;
            references?: { leads: number; landings: number };
          };
        };
      };
      if (e.response?.data?.error === "PIXEL_REFERENCED") {
        const refs = e.response.data.references;
        const msg = refs
          ? `No se puede eliminar: ${refs.landings} landing(s) y ${refs.leads} lead(s) lo referencian.`
          : "No se puede eliminar: el pixel tiene referencias activas.";
        setDeleteErrors((prev) => ({ ...prev, [p.id]: msg }));
      } else {
        toast.error("No se pudo eliminar el pixel");
      }
    }
  };

  const pixelHasLeads = (p: MetaPixel) => p.leadCount > 0;

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <RadioIcon data-icon="inline-start" className="size-4" />
        Gestionar pixels
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pixels de seguimiento</DialogTitle>
          <DialogDescription>
            Creá, editá o eliminá pixels. El Pixel ID queda congelado cuando hay leads asociados.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : pixels.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay pixels registrados.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {pixels.map((p) => (
              <div key={p.id} className="flex flex-col gap-1 rounded-md border p-3">
                {editingPixel?.id === p.id ? (
                  <form
                    onSubmit={updateForm.handleSubmit(onUpdatePixel)}
                    className="flex flex-col gap-2"
                  >
                    <FieldGroup>
                      <Field
                        data-invalid={Boolean(updateForm.formState.errors.pixelId)}
                      >
                        <FieldLabel htmlFor={`edit-pixel-id-${p.id}`}>
                          Pixel ID
                          {pixelHasLeads(p) && (
                            <span
                              title="Congelado: hay leads asociados"
                              className="ml-1 inline-flex items-center gap-1 text-xs text-amber-600"
                            >
                              <LockIcon className="size-3" /> Congelado
                            </span>
                          )}
                        </FieldLabel>
                        <FieldContent>
                          <Input
                            id={`edit-pixel-id-${p.id}`}
                            disabled={pixelHasLeads(p)}
                            aria-invalid={Boolean(updateForm.formState.errors.pixelId)}
                            {...updateForm.register("pixelId")}
                          />
                          {pixelHasLeads(p) && (
                            <FieldDescription>
                              Hay {p.leadCount} lead(s) asociados. El Pixel ID no puede modificarse
                              para preservar la atribución histórica. Podés rotar el Access Token o
                              editar la etiqueta.
                            </FieldDescription>
                          )}
                          <FieldError errors={[updateForm.formState.errors.pixelId]} />
                        </FieldContent>
                      </Field>

                      <Field>
                        <FieldLabel htmlFor={`edit-access-token-${p.id}`}>
                          Nuevo Access Token
                        </FieldLabel>
                        <FieldContent>
                          <Input
                            id={`edit-access-token-${p.id}`}
                            type="password"
                            placeholder="Dejá vacío para no cambiar"
                            {...updateForm.register("accessToken")}
                          />
                          <FieldDescription>
                            Siempre editable. Dejalo vacío para mantener el token actual.
                          </FieldDescription>
                        </FieldContent>
                      </Field>

                      <Field>
                        <FieldLabel htmlFor={`edit-label-${p.id}`}>Etiqueta</FieldLabel>
                        <FieldContent>
                          <Input
                            id={`edit-label-${p.id}`}
                            placeholder="Nombre descriptivo (opcional)"
                            {...updateForm.register("label")}
                          />
                        </FieldContent>
                      </Field>
                    </FieldGroup>

                    <div className="flex gap-2">
                      <Button type="submit" size="sm" disabled={updatePixel.isPending}>
                        {updatePixel.isPending ? "Guardando..." : "Guardar"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingPixel(null)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-sm font-medium">{p.pixelId}</span>
                        {p.label && (
                          <span className="text-xs text-muted-foreground">· {p.label}</span>
                        )}
                        {pixelHasLeads(p) && (
                          <span
                            title="Pixel ID congelado: tiene leads asociados"
                            className="inline-flex items-center gap-0.5 rounded-sm bg-amber-100 px-1 py-0.5 text-xs text-amber-700 dark:bg-amber-900 dark:text-amber-200"
                          >
                            <LockIcon className="size-3" />
                            {p.leadCount} lead(s)
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {p.landingCount} landing(s)
                      </span>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Editar pixel"
                        onClick={() => openEditPixel(p)}
                      >
                        <PencilLineIcon className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Eliminar pixel"
                        onClick={() => handleDeletePixel(p)}
                        disabled={deletePixel.isPending}
                      >
                        <Trash2Icon className="size-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                )}

                {deleteErrors[p.id] && (
                  <p role="alert" className="text-xs text-destructive">
                    {deleteErrors[p.id]}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Create pixel inline form */}
        {createOpen ? (
          <form
            onSubmit={createForm.handleSubmit(onCreatePixel)}
            className="flex flex-col gap-3 border-t pt-3"
          >
            <p className="text-sm font-medium">Nuevo pixel</p>
            <FieldGroup>
              <Field data-invalid={Boolean(createForm.formState.errors.pixelId)}>
                <FieldLabel htmlFor="new-pixel-id">Pixel ID</FieldLabel>
                <FieldContent>
                  <Input
                    id="new-pixel-id"
                    placeholder="ej. 976916338006290"
                    aria-invalid={Boolean(createForm.formState.errors.pixelId)}
                    {...createForm.register("pixelId")}
                  />
                  <FieldError errors={[createForm.formState.errors.pixelId]} />
                </FieldContent>
              </Field>

              <Field data-invalid={Boolean(createForm.formState.errors.accessToken)}>
                <FieldLabel htmlFor="new-access-token">Access Token</FieldLabel>
                <FieldContent>
                  <Input
                    id="new-access-token"
                    type="password"
                    aria-invalid={Boolean(createForm.formState.errors.accessToken)}
                    {...createForm.register("accessToken")}
                  />
                  <FieldError errors={[createForm.formState.errors.accessToken]} />
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel htmlFor="new-pixel-label">Etiqueta (opcional)</FieldLabel>
                <FieldContent>
                  <Input
                    id="new-pixel-label"
                    placeholder="Nombre descriptivo"
                    {...createForm.register("label")}
                  />
                </FieldContent>
              </Field>
            </FieldGroup>

            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={createPixel.isPending}>
                {createPixel.isPending ? "Guardando..." : "Crear pixel"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCreateOpen(false);
                  createForm.reset();
                }}
              >
                Cancelar
              </Button>
            </div>
          </form>
        ) : (
          <div className="border-t pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setCreateOpen(true)}
            >
              <PlusIcon data-icon="inline-start" />
              Crear pixel nuevo
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export const AdminLandingsPage = () => {
  const { data: landings = [], isLoading } = useLandings();
  const { data: pixels = [] } = useMetaPixels();
  const createLanding = useCreateLanding();
  const updateLanding = useUpdateLanding();
  const setLandingStatus = useSetLandingStatus();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingLanding, setEditingLanding] = useState<Landing | null>(null);
  const [fallbacksLanding, setFallbacksLanding] = useState<Landing | null>(null);
  const [snippetLanding, setSnippetLanding] = useState<Landing | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const createForm = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      url: "",
      metaPixelRef: "",
      whatsappMessages: [],
      fallbackPhones: [],
    },
  });

  const updateForm = useForm<UpdateValues>({
    resolver: zodResolver(updateSchema),
    defaultValues: {
      url: "",
      metaPixelRef: "",
      whatsappMessages: [],
    },
  });

  const onCreate = async (values: CreateValues) => {
    try {
      await createLanding.mutateAsync({
        url: values.url,
        metaPixelRef: values.metaPixelRef,
        whatsappMessages: values.whatsappMessages ?? [],
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
    if (!editingLanding) return;

    try {
      await updateLanding.mutateAsync({
        landingId: editingLanding.id,
        input: {
          url: values.url,
          metaPixelRef: values.metaPixelRef,
          whatsappMessages: values.whatsappMessages,
        },
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
        landing.status === "ACTIVE" ? "Landing deshabilitada" : "Landing habilitada",
      );
    } catch {
      toast.error("No se pudo actualizar el estado");
    }
  };

  const openEditDialog = (landing: Landing) => {
    setEditingLanding(landing);
    updateForm.reset({
      url: landing.url,
      metaPixelRef: landing.metaPixelId ?? "",
      whatsappMessages: landing.whatsappMessages ?? [],
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
          <div className="flex gap-2">
            <MetaPixelManagementDialog />

            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger render={<Button />}>
                <PlusIcon data-icon="inline-start" />
                Nueva landing
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Crear landing</DialogTitle>
                  <DialogDescription>
                    Define URL, pixel de seguimiento, mensajes y al menos un teléfono de respaldo.
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

                    <MetaPixelSelectorField
                      id="create-landing-pixel"
                      value={createForm.watch("metaPixelRef")}
                      onChange={(id) => createForm.setValue("metaPixelRef", id, { shouldValidate: true })}
                      pixels={pixels}
                      error={createForm.formState.errors.metaPixelRef?.message}
                    />
                  </FieldGroup>

                  {/* WhatsApp messages editor */}
                  <div className="rounded-lg border p-3">
                    <WhatsappMessagesEditor form={createForm} fieldArrayName="whatsappMessages" />
                  </div>

                  {/* Fallback phones section */}
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
          </div>
        }
      />

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>URL</TableHead>
                <TableHead>Pixel</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Actualizada</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRowsSkeleton rows={5} cols={5} />
              ) : landings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5}>No hay landings registradas.</TableCell>
                </TableRow>
              ) : (
                paginatedLandings.map((landing) => (
                  <TableRow key={landing.id}>
                    <TableCell>{landing.url}</TableCell>
                    <TableCell>
                      {landing.metaPixel ? (
                        <span className="font-mono text-sm">
                          {pixelLabel(landing.metaPixel)}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Sin pixel</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        variant={landing.status === "ACTIVE" ? "default" : "outline"}
                        icon={
                          landing.status === "ACTIVE" ? CheckCircle2Icon : CircleDashedIcon
                        }
                      >
                        {landing.status === "ACTIVE" ? "Activa" : "Deshabilitada"}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>{formatDateTime(landing.updatedAt)}</TableCell>
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
                            <DropdownMenuItem onClick={() => openEditDialog(landing)}>
                              <PencilLineIcon className="size-4" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setFallbacksLanding(landing)}
                            >
                              <PhoneIcon className="size-4" />
                              Números de respaldo
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setSnippetLanding(landing)}
                            >
                              <Code2Icon className="size-4" />
                              Snippet de integración
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toggleLanding(landing)}>
                              {landing.status === "ACTIVE" ? (
                                <ToggleLeftIcon className="size-4" />
                              ) : (
                                <ToggleRightIcon className="size-4" />
                              )}
                              {landing.status === "ACTIVE" ? "Deshabilitar" : "Habilitar"}
                            </DropdownMenuItem>
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

      {/* Edit landing dialog */}
      <Dialog
        open={Boolean(editingLanding)}
        onOpenChange={(open) => {
          if (!open) setEditingLanding(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar landing</DialogTitle>
            <DialogDescription>
              Editá URL, pixel de seguimiento o mensajes. Los teléfonos de respaldo se gestionan
              desde la acción "Números de respaldo".
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

              <MetaPixelSelectorField
                id="edit-landing-pixel"
                value={updateForm.watch("metaPixelRef")}
                onChange={(id) =>
                  updateForm.setValue("metaPixelRef", id, { shouldValidate: true })
                }
                pixels={pixels}
                error={updateForm.formState.errors.metaPixelRef?.message}
              />
            </FieldGroup>

            {/* WhatsApp messages editor */}
            <div className="rounded-lg border p-3">
              <WhatsappMessagesEditor form={updateForm} fieldArrayName="whatsappMessages" />
            </div>

            <DialogFooter>
              <Button type="submit" disabled={updateLanding.isPending}>
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
          if (!open) setFallbacksLanding(null);
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

      {/* Snippet de integración dialog */}
      <Dialog
        open={Boolean(snippetLanding)}
        onOpenChange={(open) => {
          if (!open) setSnippetLanding(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Snippet de integración</DialogTitle>
            <DialogDescription>
              Pegá este código en tu landing para activar el formulario de contacto.
            </DialogDescription>
          </DialogHeader>
          {snippetLanding && <EmbedSnippetPanel landing={snippetLanding} />}
        </DialogContent>
      </Dialog>
    </section>
  );
};
