import { useEffect, useMemo } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { isAxiosError } from 'axios';
import { toast } from 'sonner';
import { CoinsIcon, TrendingUpIcon } from 'lucide-react';
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
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useCurrencyOptions,
  usePlatformCurrency,
  useUpdatePlatformCurrency,
  useHighValueThreshold,
  useUpdateHighValueThreshold,
  useHighValueTier1Threshold,
  useUpdateHighValueTier1Threshold,
  useHighValueTier2Threshold,
  useUpdateHighValueTier2Threshold,
  useHighValueTier3Threshold,
  useUpdateHighValueTier3Threshold,
} from '@/features/admin/admin-hooks';

// Defaults mirror DEFAULT_CONVERSION_CONFIG in the worker — shown when a
// setting is unset so the UI reflects the value the backend actually applies.
const DEFAULT_CURRENCY = 'ARS';
const DEFAULTS = {
  highValue: '10000',
  tier1: '25000',
  tier2: '50000',
  tier3: '100000',
} as const;

const extractServerMessage = (error: unknown): string | null =>
  isAxiosError<{ message?: string; error?: string }>(error)
    ? (error.response?.data?.message ?? error.response?.data?.error ?? null)
    : null;

// ---------------------------------------------------------------------------
// Currency selector
// ---------------------------------------------------------------------------

const CurrencySection = () => {
  const optionsQuery = useCurrencyOptions();
  const currentQuery = usePlatformCurrency();
  const updateCurrency = useUpdatePlatformCurrency();

  const isLoading = optionsQuery.isLoading || currentQuery.isLoading;
  const options = useMemo(
    () => optionsQuery.data?.currencies ?? [],
    [optionsQuery.data],
  );
  const current = currentQuery.data?.value || DEFAULT_CURRENCY;

  const items = useMemo(
    () => Object.fromEntries(options.map((o) => [o.code, o.label])),
    [options],
  );

  const onChange = async (code: string) => {
    if (code === current) return;
    try {
      await updateCurrency.mutateAsync(code);
      toast.success('Divisa actualizada');
    } catch (error) {
      toast.error(extractServerMessage(error) ?? 'No se pudo actualizar la divisa');
    }
  };

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <CoinsIcon className="size-4" />
          </div>
          <h3 className="font-medium leading-tight">Divisa de la plataforma</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Moneda (ISO 4217) que se envia a Meta en todos los eventos con monto
          (Purchase y HighValue). Aplica a toda la plataforma.
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-8 w-56" />
      ) : (
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="platform-currency">Divisa</FieldLabel>
            <FieldContent>
              <Select
                value={current}
                items={items}
                onValueChange={(value) => {
                  if (typeof value === 'string') void onChange(value);
                }}
              >
                <SelectTrigger
                  id="platform-currency"
                  className="w-56"
                  disabled={updateCurrency.isPending}
                >
                  <SelectValue placeholder="Selecciona una divisa" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((option) => (
                    <SelectItem key={option.code} value={option.code}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>
        </FieldGroup>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// High-value thresholds
// ---------------------------------------------------------------------------

const thresholdsSchema = z
  .object({
    highValue: z.string().regex(/^\d+$/, 'Debe ser un numero entero'),
    tier1: z.string().regex(/^\d+$/, 'Debe ser un numero entero'),
    tier2: z.string().regex(/^\d+$/, 'Debe ser un numero entero'),
    tier3: z.string().regex(/^\d+$/, 'Debe ser un numero entero'),
  })
  .superRefine((data, ctx) => {
    const nums = {
      highValue: Number.parseInt(data.highValue, 10),
      tier1: Number.parseInt(data.tier1, 10),
      tier2: Number.parseInt(data.tier2, 10),
      tier3: Number.parseInt(data.tier3, 10),
    };
    for (const key of ['highValue', 'tier1', 'tier2', 'tier3'] as const) {
      if (!(nums[key] > 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: 'Debe ser mayor a 0',
        });
      }
    }
    if (nums.tier1 < nums.highValue) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tier1'], message: 'Debe ser >= umbral base' });
    }
    if (nums.tier2 < nums.tier1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tier2'], message: 'Debe ser >= Tier 1' });
    }
    if (nums.tier3 < nums.tier2) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tier3'], message: 'Debe ser >= Tier 2' });
    }
  });

type ThresholdsFormValues = z.infer<typeof thresholdsSchema>;

const THRESHOLD_FIELDS: ReadonlyArray<{
  key: keyof ThresholdsFormValues;
  label: string;
  help: string;
}> = [
  { key: 'highValue', label: 'Cliente de alto valor', help: 'Dispara HighValueCustomer' },
  { key: 'tier1', label: 'Tier 1', help: 'Dispara HighValueTier1' },
  { key: 'tier2', label: 'Tier 2', help: 'Dispara HighValueTier2' },
  { key: 'tier3', label: 'Tier 3', help: 'Dispara HighValueTier3' },
];

const ThresholdsSection = () => {
  const currencyQuery = usePlatformCurrency();
  const highValueQuery = useHighValueThreshold();
  const tier1Query = useHighValueTier1Threshold();
  const tier2Query = useHighValueTier2Threshold();
  const tier3Query = useHighValueTier3Threshold();

  const updateHighValue = useUpdateHighValueThreshold();
  const updateTier1 = useUpdateHighValueTier1Threshold();
  const updateTier2 = useUpdateHighValueTier2Threshold();
  const updateTier3 = useUpdateHighValueTier3Threshold();

  const currency = currencyQuery.data?.value || DEFAULT_CURRENCY;

  const isLoading =
    highValueQuery.isLoading ||
    tier1Query.isLoading ||
    tier2Query.isLoading ||
    tier3Query.isLoading;

  const serverValues = useMemo<ThresholdsFormValues>(
    () => ({
      highValue: highValueQuery.data?.value || DEFAULTS.highValue,
      tier1: tier1Query.data?.value || DEFAULTS.tier1,
      tier2: tier2Query.data?.value || DEFAULTS.tier2,
      tier3: tier3Query.data?.value || DEFAULTS.tier3,
    }),
    [highValueQuery.data, tier1Query.data, tier2Query.data, tier3Query.data],
  );

  const form = useForm<ThresholdsFormValues>({
    resolver: zodResolver(thresholdsSchema),
    defaultValues: { ...DEFAULTS },
    mode: 'onChange',
  });

  useEffect(() => {
    if (
      highValueQuery.data !== undefined &&
      tier1Query.data !== undefined &&
      tier2Query.data !== undefined &&
      tier3Query.data !== undefined
    ) {
      form.reset(serverValues);
    }
  }, [serverValues, highValueQuery.data, tier1Query.data, tier2Query.data, tier3Query.data, form]);

  const current = form.watch();
  const isDirty = (Object.keys(serverValues) as Array<keyof ThresholdsFormValues>).some(
    (k) => current[k] !== serverValues[k],
  );

  const isSaving =
    updateHighValue.isPending ||
    updateTier1.isPending ||
    updateTier2.isPending ||
    updateTier3.isPending;

  const onSubmit = async (values: ThresholdsFormValues) => {
    const ops: Array<Promise<unknown>> = [];
    if (values.highValue !== serverValues.highValue)
      ops.push(updateHighValue.mutateAsync(values.highValue));
    if (values.tier1 !== serverValues.tier1) ops.push(updateTier1.mutateAsync(values.tier1));
    if (values.tier2 !== serverValues.tier2) ops.push(updateTier2.mutateAsync(values.tier2));
    if (values.tier3 !== serverValues.tier3) ops.push(updateTier3.mutateAsync(values.tier3));

    try {
      await Promise.all(ops);
      toast.success('Umbrales actualizados');
    } catch (error) {
      toast.error(extractServerMessage(error) ?? 'No se pudieron guardar los umbrales');
    }
  };

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <TrendingUpIcon className="size-4" />
          </div>
          <h3 className="font-medium leading-tight">Umbrales de alto valor ({currency})</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Montos (en la divisa elegida) a partir de los cuales se envian eventos
          HighValue adicionales a Meta. Deben ser crecientes.
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : (
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-3">
            {THRESHOLD_FIELDS.map((f) => (
              <FieldGroup key={f.key}>
                <Field data-invalid={Boolean(form.formState.errors[f.key])}>
                  <FieldLabel htmlFor={`threshold-${f.key}`}>{f.label}</FieldLabel>
                  <FieldContent>
                    <Input
                      id={`threshold-${f.key}`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      {...form.register(f.key)}
                      aria-invalid={Boolean(form.formState.errors[f.key])}
                    />
                    <p className="text-xs text-muted-foreground">{f.help}</p>
                    <FieldError errors={[form.formState.errors[f.key]]} />
                  </FieldContent>
                </Field>
              </FieldGroup>
            ))}
          </div>

          {isDirty && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="submit"
                size="sm"
                disabled={isSaving || !form.formState.isValid}
                className="flex-1 sm:flex-none"
              >
                {isSaving ? 'Guardando...' : 'Guardar umbrales'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => form.reset(serverValues)}
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

export const CurrencySettings = () => {
  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>Divisa y conversiones</CardTitle>
        <CardDescription>
          Define la moneda y los umbrales de alto valor que se envian a Meta en
          los eventos con monto.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 sm:gap-6">
        <CurrencySection />
        <Separator />
        <ThresholdsSection />
      </CardContent>
    </Card>
  );
};
