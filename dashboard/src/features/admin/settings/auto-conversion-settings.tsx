import { useEffect } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { isAxiosError } from 'axios';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useAutoConversionTrigger,
  useUpdateAutoConversionTrigger,
  useAutoConversionMinAmount,
  useUpdateAutoConversionMinAmount,
  useAutoConversionMaxAmount,
  useUpdateAutoConversionMaxAmount,
} from '@/features/admin/admin-hooks';

// ---------------------------------------------------------------------------
// Trigger phrase form
// ---------------------------------------------------------------------------

const triggerSchema = z.object({
  value: z
    .string()
    .min(1, 'La frase no puede estar vacia')
    .max(200, 'Maximo 200 caracteres'),
});

type TriggerFormValues = z.infer<typeof triggerSchema>;

const TriggerPhraseCard = () => {
  const { data, isLoading } = useAutoConversionTrigger();
  const updateTrigger = useUpdateAutoConversionTrigger();

  const form = useForm<TriggerFormValues>({
    resolver: zodResolver(triggerSchema),
    defaultValues: { value: '' },
  });

  useEffect(() => {
    if (data !== undefined) {
      form.reset({ value: data.value });
    }
  }, [data, form]);

  const currentValue = form.watch('value');
  const isSameAsServer = data !== undefined && currentValue === data.value;

  const onSubmit = async (values: TriggerFormValues) => {
    try {
      await updateTrigger.mutateAsync(values.value);
      toast.success('Frase actualizada');
    } catch (error) {
      const serverMessage = isAxiosError<{ message?: string; error?: string }>(error)
        ? (error.response?.data?.message ?? error.response?.data?.error ?? null)
        : null;
      toast.error(serverMessage ?? 'No se pudo guardar la frase');
    }
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Disparador de conversion automatica</CardTitle>
        <CardDescription>
          Cuando un cajero envia este texto en un chat, el worker procesa el ultimo
          comprobante adjunto y crea la conversion automaticamente. Dejar en blanco
          para deshabilitar el flujo no esta permitido; para desactivar, elimina la
          frase desde la base de datos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-28" />
          </div>
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FieldGroup>
              <Field data-invalid={Boolean(form.formState.errors.value)}>
                <FieldLabel htmlFor="auto-conversion-trigger-phrase">
                  Frase disparadora
                </FieldLabel>
                <FieldContent>
                  <Input
                    id="auto-conversion-trigger-phrase"
                    placeholder="Ej: procesar"
                    {...form.register('value')}
                    aria-invalid={Boolean(form.formState.errors.value)}
                  />
                  <FieldError errors={[form.formState.errors.value]} />
                </FieldContent>
              </Field>
            </FieldGroup>

            <Button
              type="submit"
              className="w-fit"
              disabled={updateTrigger.isPending || isSameAsServer}
            >
              {updateTrigger.isPending ? 'Guardando...' : 'Guardar frase'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Amount field card (reusable for min and max)
// ---------------------------------------------------------------------------

const amountSchema = z.object({
  value: z
    .string()
    .regex(/^\d+$/, 'Debe ser un numero entero')
    .refine((v) => parseInt(v, 10) >= 0, 'Debe ser mayor o igual a 0'),
});

type AmountFormValues = z.infer<typeof amountSchema>;

type AmountCardProps = {
  title: string;
  description: string;
  inputId: string;
  helperText: string;
  useGet: () => ReturnType<typeof useAutoConversionMinAmount>;
  useUpdate: () => ReturnType<typeof useUpdateAutoConversionMinAmount>;
  saveLabel?: string;
};

const AmountCard = ({
  title,
  description,
  inputId,
  helperText,
  useGet,
  useUpdate,
  saveLabel = 'Guardar monto',
}: AmountCardProps) => {
  const { data, isLoading } = useGet();
  const updateAmount = useUpdate();

  const form = useForm<AmountFormValues>({
    resolver: zodResolver(amountSchema),
    defaultValues: { value: '0' },
  });

  useEffect(() => {
    if (data !== undefined) {
      form.reset({ value: data.value || '0' });
    }
  }, [data, form]);

  const currentValue = form.watch('value');
  const isSameAsServer = data !== undefined && currentValue === (data.value || '0');

  const onSubmit = async (values: AmountFormValues) => {
    try {
      await updateAmount.mutateAsync(values.value);
      toast.success(`${title} actualizado`);
    } catch (error) {
      const serverMessage = isAxiosError<{ message?: string; error?: string }>(error)
        ? (error.response?.data?.message ?? error.response?.data?.error ?? null)
        : null;
      toast.error(serverMessage ?? 'No se pudo guardar el monto');
    }
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-28" />
          </div>
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FieldGroup>
              <Field data-invalid={Boolean(form.formState.errors.value)}>
                <FieldLabel htmlFor={inputId}>{helperText}</FieldLabel>
                <FieldContent>
                  <Input
                    id={inputId}
                    type="number"
                    min={0}
                    step={1}
                    placeholder="0"
                    {...form.register('value')}
                    aria-invalid={Boolean(form.formState.errors.value)}
                  />
                  <FieldError errors={[form.formState.errors.value]} />
                </FieldContent>
              </Field>
            </FieldGroup>

            <Button
              type="submit"
              className="w-fit"
              disabled={updateAmount.isPending || isSameAsServer}
            >
              {updateAmount.isPending ? 'Guardando...' : saveLabel}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Main export: combined settings component
// ---------------------------------------------------------------------------

export const AutoConversionSettings = () => {
  return (
    <>
      <TriggerPhraseCard />

      <AmountCard
        title="Monto minimo (ARS)"
        description="Si el OCR detecta un monto menor a este valor, la conversion NO se crea y se notifica al cajero. 0 = sin minimo (deshabilitado)."
        inputId="auto-conversion-min-amount"
        helperText="Monto minimo en ARS (0 = sin minimo)"
        useGet={useAutoConversionMinAmount}
        useUpdate={useUpdateAutoConversionMinAmount}
        saveLabel="Guardar minimo"
      />

      <AmountCard
        title="Monto maximo (ARS)"
        description="Si el OCR detecta un monto mayor a este valor, la conversion NO se crea y se notifica al cajero. 0 = sin maximo (deshabilitado). Nota: el servidor no valida min <= max; asegurate de configurarlos correctamente."
        inputId="auto-conversion-max-amount"
        helperText="Monto maximo en ARS (0 = sin maximo)"
        useGet={useAutoConversionMaxAmount}
        useUpdate={useUpdateAutoConversionMaxAmount}
        saveLabel="Guardar maximo"
      />
    </>
  );
};
