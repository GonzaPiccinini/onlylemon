import { useEffect } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Landing, MetaPixel } from "@/types/domain";
import { useCreateLanding, useUpdateLanding } from "@/features/admin/admin-hooks";
import { WhatsappMessagesEditor } from "./whatsapp-messages-editor";
import { FallbackPhonesEditor } from "./fallback-phones-editor";
import { PixelSelect } from "./pixel-select";
import {
  createLandingSchema,
  updateLandingSchema,
  type CreateLandingValues,
  type UpdateLandingValues,
} from "./schemas";

type LandingDetailConfigProps = {
  /** null → draft/create mode. */
  landing: Landing | null;
  pixels: MetaPixel[];
  onCreated: (landingId: string) => void;
  onGoToPixels: () => void;
};

const SectionCard = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-3 rounded-xl glass-subtle p-4">
    <h3 className="text-sm font-medium">{title}</h3>
    {children}
  </div>
);

// ---------------------------------------------------------------------------
// Fallback sub-form used only in draft/create mode (field array, min 1).
// ---------------------------------------------------------------------------

const DraftFallbackSection = ({
  form,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: ReturnType<typeof useForm<any>>;
}) => {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "fallbackPhones",
  });

  const errors = form.formState.errors.fallbackPhones as
    | Array<{ phone?: { message?: string } } | undefined>
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

      {rootError && <p role="alert" className="text-sm text-destructive">{rootError}</p>}

      {fields.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Agregá al menos un teléfono de respaldo antes de guardar.
        </p>
      )}

      {fields.map((field, index) => {
        const rowErrors = Array.isArray(errors) ? errors[index] : undefined;
        return (
          <div key={field.id} className="flex items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Field data-invalid={Boolean(rowErrors?.phone)}>
                <FieldContent>
                  <Input
                    placeholder="+5491123456789"
                    aria-label={`Teléfono de respaldo ${index + 1}`}
                    aria-invalid={Boolean(rowErrors?.phone)}
                    {...form.register(`fallbackPhones.${index}.phone`)}
                  />
                  {rowErrors?.phone && <FieldError errors={[rowErrors.phone]} />}
                </FieldContent>
              </Field>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Field>
                <FieldContent>
                  <Input
                    placeholder="Etiqueta (opcional)"
                    aria-label={`Etiqueta del respaldo ${index + 1}`}
                    {...form.register(`fallbackPhones.${index}.label`)}
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
// Create (draft) form
// ---------------------------------------------------------------------------

const CreateLandingForm = ({
  pixels,
  onCreated,
  onGoToPixels,
}: {
  pixels: MetaPixel[];
  onCreated: (landingId: string) => void;
  onGoToPixels: () => void;
}) => {
  const createLanding = useCreateLanding();
  const form = useForm<CreateLandingValues>({
    resolver: zodResolver(createLandingSchema),
    defaultValues: { url: "", metaPixelRef: "", whatsappMessages: [], fallbackPhones: [] },
  });

  const onSubmit = async (values: CreateLandingValues) => {
    try {
      const created = await createLanding.mutateAsync({
        url: values.url,
        metaPixelRef: values.metaPixelRef,
        whatsappMessages: values.whatsappMessages ?? [],
        fallbackPhones: values.fallbackPhones,
      });
      toast.success("Landing creada");
      form.reset();
      onCreated(created.id);
    } catch {
      toast.error("No se pudo crear la landing");
    }
  };

  const noPixels = pixels.length === 0;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-w-0 flex-col gap-4">
      <SectionCard title="Datos de la landing">
        <FieldGroup>
          <Field data-invalid={Boolean(form.formState.errors.url)}>
            <FieldLabel htmlFor="draft-landing-url">URL</FieldLabel>
            <FieldContent>
              <Input
                id="draft-landing-url"
                placeholder="https://mi-landing.com"
                aria-invalid={Boolean(form.formState.errors.url)}
                {...form.register("url")}
              />
              <FieldError errors={[form.formState.errors.url]} />
            </FieldContent>
          </Field>

          <Field data-invalid={Boolean(form.formState.errors.metaPixelRef)}>
            <FieldLabel htmlFor="draft-landing-pixel">Pixel de seguimiento</FieldLabel>
            <FieldContent>
              {noPixels ? (
                <div className="flex flex-col items-start gap-2 text-sm text-muted-foreground">
                  <span>No hay pixels disponibles todavía.</span>
                  <Button type="button" variant="outline" size="sm" onClick={onGoToPixels}>
                    Crear un pixel
                  </Button>
                </div>
              ) : (
                <PixelSelect
                  id="draft-landing-pixel"
                  value={form.watch("metaPixelRef")}
                  onChange={(id) => form.setValue("metaPixelRef", id, { shouldValidate: true })}
                  pixels={pixels}
                  invalid={Boolean(form.formState.errors.metaPixelRef)}
                />
              )}
              <FieldError errors={[form.formState.errors.metaPixelRef]} />
            </FieldContent>
          </Field>
        </FieldGroup>
      </SectionCard>

      <SectionCard title="Mensajes de WhatsApp">
        <WhatsappMessagesEditor form={form} fieldArrayName="whatsappMessages" />
      </SectionCard>

      <SectionCard title="Respaldo">
        <DraftFallbackSection form={form} />
      </SectionCard>

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={createLanding.isPending || form.watch("fallbackPhones").length === 0}
        >
          {createLanding.isPending ? "Guardando…" : "Crear landing"}
        </Button>
      </div>
    </form>
  );
};

// ---------------------------------------------------------------------------
// Edit (existing landing) form
// ---------------------------------------------------------------------------

const EditLandingForm = ({
  landing,
  pixels,
}: {
  landing: Landing;
  pixels: MetaPixel[];
}) => {
  const updateLanding = useUpdateLanding();
  const form = useForm<UpdateLandingValues>({
    resolver: zodResolver(updateLandingSchema),
    defaultValues: {
      url: landing.url,
      metaPixelRef: landing.metaPixelId ?? "",
      whatsappMessages: landing.whatsappMessages ?? [],
    },
  });

  // Re-seed the form whenever a different landing is selected.
  useEffect(() => {
    form.reset({
      url: landing.url,
      metaPixelRef: landing.metaPixelId ?? "",
      whatsappMessages: landing.whatsappMessages ?? [],
    });
  }, [landing.id, landing.url, landing.metaPixelId, landing.whatsappMessages, form]);

  const onSubmit = async (values: UpdateLandingValues) => {
    try {
      await updateLanding.mutateAsync({
        landingId: landing.id,
        input: {
          url: values.url,
          metaPixelRef: values.metaPixelRef,
          whatsappMessages: values.whatsappMessages,
        },
      });
      toast.success("Landing actualizada");
    } catch {
      toast.error("No se pudo actualizar la landing");
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-w-0 flex-col gap-4">
        <SectionCard title="Datos de la landing">
          <FieldGroup>
            <Field data-invalid={Boolean(form.formState.errors.url)}>
              <FieldLabel htmlFor={`edit-landing-url-${landing.id}`}>URL</FieldLabel>
              <FieldContent>
                <Input
                  id={`edit-landing-url-${landing.id}`}
                  aria-invalid={Boolean(form.formState.errors.url)}
                  {...form.register("url")}
                />
                <FieldError errors={[form.formState.errors.url]} />
              </FieldContent>
            </Field>

            <Field data-invalid={Boolean(form.formState.errors.metaPixelRef)}>
              <FieldLabel htmlFor={`edit-landing-pixel-${landing.id}`}>
                Pixel de seguimiento
              </FieldLabel>
              <FieldContent>
                <PixelSelect
                  id={`edit-landing-pixel-${landing.id}`}
                  value={form.watch("metaPixelRef")}
                  onChange={(id) => form.setValue("metaPixelRef", id, { shouldValidate: true })}
                  pixels={pixels}
                  invalid={Boolean(form.formState.errors.metaPixelRef)}
                />
                <FieldError errors={[form.formState.errors.metaPixelRef]} />
              </FieldContent>
            </Field>
          </FieldGroup>
        </SectionCard>

        <SectionCard title="Mensajes de WhatsApp">
          <WhatsappMessagesEditor form={form} fieldArrayName="whatsappMessages" />
        </SectionCard>

        <div className="flex justify-end">
          <Button type="submit" disabled={updateLanding.isPending}>
            {updateLanding.isPending ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </form>

      {/* Fallback phones are managed against their own endpoints, outside the form. */}
      <SectionCard title="Teléfonos de respaldo">
        <FallbackPhonesEditor landing={landing} />
      </SectionCard>
    </div>
  );
};

export const LandingDetailConfig = ({
  landing,
  pixels,
  onCreated,
  onGoToPixels,
}: LandingDetailConfigProps) => {
  if (!landing) {
    return <CreateLandingForm pixels={pixels} onCreated={onCreated} onGoToPixels={onGoToPixels} />;
  }
  return <EditLandingForm landing={landing} pixels={pixels} />;
};
