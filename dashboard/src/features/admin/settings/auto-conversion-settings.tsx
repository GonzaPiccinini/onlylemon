import { useEffect, useMemo } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { isAxiosError } from 'axios';
import { toast } from 'sonner';
import { ZapIcon, WalletIcon, CheckCircle2Icon, CircleDashedIcon } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  useAutoConversionTrigger,
  useUpdateAutoConversionTrigger,
  useAutoConversionMinAmount,
  useUpdateAutoConversionMinAmount,
  useAutoConversionMaxAmount,
  useUpdateAutoConversionMaxAmount,
} from '@/features/admin/admin-hooks';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const triggerSchema = z.object({
  value: z
    .string()
    .min(1, 'La frase no puede estar vacia')
    .max(200, 'Maximo 200 caracteres'),
});

type TriggerFormValues = z.infer<typeof triggerSchema>;

const amountsSchema = z
  .object({
    min: z.string().regex(/^\d+$/, 'Debe ser un numero entero'),
    max: z.string().regex(/^\d+$/, 'Debe ser un numero entero'),
  })
  .superRefine((data, ctx) => {
    const min = Number.parseInt(data.min, 10);
    const max = Number.parseInt(data.max, 10);
    if (min > 0 && max > 0 && min > max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['min'],
        message: 'No puede ser mayor al maximo',
      });
    }
  });

type AmountsFormValues = z.infer<typeof amountsSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatARS = (raw: string | undefined) => {
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Intl.NumberFormat('es-AR').format(n);
};

const extractServerMessage = (error: unknown): string | null =>
  isAxiosError<{ message?: string; error?: string }>(error)
    ? (error.response?.data?.message ?? error.response?.data?.error ?? null)
    : null;

// ---------------------------------------------------------------------------
// Trigger phrase section
// ---------------------------------------------------------------------------

const TriggerPhraseSection = () => {
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
  const serverValue = data?.value ?? '';
  const isDirty = currentValue !== serverValue;
  const isActive = Boolean(serverValue);

  const onSubmit = async (values: TriggerFormValues) => {
    try {
      await updateTrigger.mutateAsync(values.value);
      toast.success('Frase actualizada');
    } catch (error) {
      toast.error(extractServerMessage(error) ?? 'No se pudo guardar la frase');
    }
  };

  const onReset = () => form.reset({ value: serverValue });

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <ZapIcon className="size-4" />
          </div>
          <h3 className="font-medium leading-tight">Frase disparadora</h3>
          {!isLoading && (
            <Badge variant={isActive ? 'default' : 'outline'} className="ml-auto shrink-0">
              {isActive ? (
                <>
                  <CheckCircle2Icon /> Activo
                </>
              ) : (
                <>
                  <CircleDashedIcon /> Inactivo
                </>
              )}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Texto que el cajero envia en el chat para crear automaticamente la conversion
          a partir del ultimo comprobante adjunto.
        </p>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-28" />
        </div>
      ) : (
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-3">
          <FieldGroup>
            <Field data-invalid={Boolean(form.formState.errors.value)}>
              <FieldLabel htmlFor="auto-conversion-trigger-phrase" className="sr-only">
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

          {isDirty && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="submit"
                size="sm"
                disabled={updateTrigger.isPending}
                className="flex-1 sm:flex-none"
              >
                {updateTrigger.isPending ? 'Guardando...' : 'Guardar frase'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onReset}
                disabled={updateTrigger.isPending}
                className="flex-1 sm:flex-none"
              >
                Cancelar
              </Button>
            </div>
          )}
        </form>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Amounts section (min + max together)
// ---------------------------------------------------------------------------

const AmountsSection = () => {
  const minQuery = useAutoConversionMinAmount();
  const maxQuery = useAutoConversionMaxAmount();
  const updateMin = useUpdateAutoConversionMinAmount();
  const updateMax = useUpdateAutoConversionMaxAmount();

  const isLoading = minQuery.isLoading || maxQuery.isLoading;

  const serverValues = useMemo(
    () => ({
      min: minQuery.data?.value || '0',
      max: maxQuery.data?.value || '0',
    }),
    [minQuery.data, maxQuery.data],
  );

  const form = useForm<AmountsFormValues>({
    resolver: zodResolver(amountsSchema),
    defaultValues: { min: '0', max: '0' },
    mode: 'onChange',
  });

  useEffect(() => {
    if (minQuery.data !== undefined && maxQuery.data !== undefined) {
      form.reset(serverValues);
    }
  }, [serverValues, minQuery.data, maxQuery.data, form]);

  const current = form.watch();
  const isDirty = current.min !== serverValues.min || current.max !== serverValues.max;

  const isSaving = updateMin.isPending || updateMax.isPending;

  const onSubmit = async (values: AmountsFormValues) => {
    try {
      const tasks: Promise<unknown>[] = [];
      // To avoid the server cross-validation failing mid-flight, send the
      // shrinking side first: when raising both, save max first; when lowering, min first.
      const newMin = Number.parseInt(values.min, 10);
      const newMax = Number.parseInt(values.max, 10);
      const oldMin = Number.parseInt(serverValues.min, 10);
      const oldMax = Number.parseInt(serverValues.max, 10);

      const ops: Array<() => Promise<unknown>> = [];
      if (values.min !== serverValues.min) {
        ops.push(() => updateMin.mutateAsync(values.min));
      }
      if (values.max !== serverValues.max) {
        ops.push(() => updateMax.mutateAsync(values.max));
      }
      // Reorder if needed: if raising max, save max before min; if lowering min, save min before max.
      if (
        values.min !== serverValues.min &&
        values.max !== serverValues.max &&
        newMax > oldMax &&
        newMin > oldMin
      ) {
        ops.reverse();
      }
      for (const op of ops) {
        tasks.push(op());
        await tasks[tasks.length - 1];
      }
      toast.success('Limites actualizados');
    } catch (error) {
      toast.error(extractServerMessage(error) ?? 'No se pudieron guardar los limites');
    }
  };

  const onReset = () => form.reset(serverValues);

  const minPretty = formatARS(current.min);
  const maxPretty = formatARS(current.max);

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <WalletIcon className="size-4" />
          </div>
          <h3 className="font-medium leading-tight">Limites de monto (ARS)</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Conversiones fuera de este rango se rechazan automaticamente. Usa 0 para
          deshabilitar cualquiera de los limites.
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : (
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-3">
            <FieldGroup>
              <Field data-invalid={Boolean(form.formState.errors.min)}>
                <FieldLabel htmlFor="auto-conversion-min-amount">Minimo</FieldLabel>
                <FieldContent>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-0 grid w-9 place-items-center text-sm text-muted-foreground">
                      $
                    </span>
                    <Input
                      id="auto-conversion-min-amount"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      placeholder="0"
                      className="pl-9"
                      {...form.register('min')}
                      aria-invalid={Boolean(form.formState.errors.min)}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {minPretty ? `$ ${minPretty} ARS` : 'Sin minimo'}
                  </p>
                  <FieldError errors={[form.formState.errors.min]} />
                </FieldContent>
              </Field>
            </FieldGroup>

            <FieldGroup>
              <Field data-invalid={Boolean(form.formState.errors.max)}>
                <FieldLabel htmlFor="auto-conversion-max-amount">Maximo</FieldLabel>
                <FieldContent>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-0 grid w-9 place-items-center text-sm text-muted-foreground">
                      $
                    </span>
                    <Input
                      id="auto-conversion-max-amount"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      placeholder="0"
                      className="pl-9"
                      {...form.register('max')}
                      aria-invalid={Boolean(form.formState.errors.max)}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {maxPretty ? `$ ${maxPretty} ARS` : 'Sin maximo'}
                  </p>
                  <FieldError errors={[form.formState.errors.max]} />
                </FieldContent>
              </Field>
            </FieldGroup>
          </div>

          {isDirty && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="submit"
                size="sm"
                disabled={isSaving || !form.formState.isValid}
                className="flex-1 sm:flex-none"
              >
                {isSaving ? 'Guardando...' : 'Guardar cambios'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onReset}
                disabled={isSaving}
                className="flex-1 sm:flex-none"
              >
                Cancelar
              </Button>
            </div>
          )}
        </form>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export const AutoConversionSettings = () => {
  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>Conversion automatica</CardTitle>
        <CardDescription>
          Configura como se crean automaticamente las conversiones a partir de los
          comprobantes que reciben los cajeros.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 sm:gap-6">
        <TriggerPhraseSection />
        <Separator />
        <AmountsSection />
      </CardContent>
    </Card>
  );
};
