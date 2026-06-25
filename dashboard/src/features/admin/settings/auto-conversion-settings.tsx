import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { isAxiosError } from 'axios';
import { toast } from 'sonner';
import { ZapIcon, WalletIcon, CheckCircle2Icon, CircleDashedIcon, XIcon } from 'lucide-react';
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
import { StatusBadge } from '@/components/common/status-badge';
import { Separator } from '@/components/ui/separator';
import {
  useAutoConversionTrigger,
  useUpdateAutoConversionTrigger,
  useAutoConversionMinAmount,
  useUpdateAutoConversionMinAmount,
  useAutoConversionMaxAmount,
  useUpdateAutoConversionMaxAmount,
} from '@/features/admin/admin-hooks';
import { useMoneyFormatter } from '@/lib/use-currency';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const MAX_PHRASE_LEN = 200;
const MAX_TOTAL_LEN = 2000;

const triggerSchema = z.object({
  phrases: z
    .array(z.string().min(1).max(MAX_PHRASE_LEN))
    .min(1, 'Agrega al menos una frase')
    .refine(
      (arr) => arr.join('\n').length <= MAX_TOTAL_LEN,
      `Las frases superan ${MAX_TOTAL_LEN} caracteres en total`,
    ),
});

type TriggerFormValues = z.infer<typeof triggerSchema>;

const parsePhrases = (raw: string): string[] =>
  raw
    .split('\n')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

const arraysEqual = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

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

const formatGroup = (raw: string | undefined) => {
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

  const serverPhrases = useMemo(() => parsePhrases(data?.value ?? ''), [data?.value]);

  const form = useForm<TriggerFormValues>({
    resolver: zodResolver(triggerSchema),
    defaultValues: { phrases: [] },
    mode: 'onChange',
  });

  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (data !== undefined) {
      form.reset({ phrases: serverPhrases });
      setDraft('');
    }
  }, [data, serverPhrases, form]);

  const currentPhrases = form.watch('phrases') ?? [];
  const isDirty = !arraysEqual(currentPhrases, serverPhrases);
  const isActive = serverPhrases.length > 0;

  const addPhrase = (raw: string) => {
    const phrase = raw.trim();
    if (!phrase) return;
    if (phrase.length > MAX_PHRASE_LEN) {
      toast.error(`Maximo ${MAX_PHRASE_LEN} caracteres por frase`);
      return;
    }
    const lower = phrase.toLowerCase();
    if (currentPhrases.some((p) => p.toLowerCase() === lower)) {
      setDraft('');
      return;
    }
    form.setValue('phrases', [...currentPhrases, phrase], {
      shouldDirty: true,
      shouldValidate: true,
    });
    setDraft('');
  };

  const removePhrase = (index: number) => {
    const next = currentPhrases.filter((_, i) => i !== index);
    form.setValue('phrases', next, { shouldDirty: true, shouldValidate: true });
  };

  const onDraftKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addPhrase(draft);
    } else if (e.key === 'Backspace' && draft.length === 0 && currentPhrases.length > 0) {
      removePhrase(currentPhrases.length - 1);
    }
  };

  const onSubmit = async (values: TriggerFormValues) => {
    if (draft.trim().length > 0) {
      addPhrase(draft);
      return;
    }
    try {
      await updateTrigger.mutateAsync(values.phrases.join('\n'));
      toast.success('Frases actualizadas');
    } catch (error) {
      toast.error(extractServerMessage(error) ?? 'No se pudo guardar las frases');
    }
  };

  const onReset = () => {
    form.reset({ phrases: serverPhrases });
    setDraft('');
  };

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <ZapIcon className="size-4" />
          </div>
          <h3 className="font-medium leading-tight">Frases disparadoras</h3>
          {!isLoading && (
            <StatusBadge
              variant={isActive ? 'default' : 'outline'}
              icon={isActive ? CheckCircle2Icon : CircleDashedIcon}
              className="ml-auto shrink-0"
            >
              {isActive ? `Activo (${serverPhrases.length})` : 'Inactivo'}
            </StatusBadge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Cualquiera de estas frases que el cajero envie en el chat dispara automaticamente
          la conversion a partir del ultimo comprobante adjunto. Presiona Enter o coma para
          agregar.
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
            <Field data-invalid={Boolean(form.formState.errors.phrases)}>
              <FieldLabel htmlFor="auto-conversion-trigger-phrase" className="sr-only">
                Frases disparadoras
              </FieldLabel>
              <FieldContent>
                <div
                  className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-1.5 text-sm shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 data-[invalid=true]:border-destructive data-[invalid=true]:ring-destructive/20"
                  data-invalid={Boolean(form.formState.errors.phrases)}
                  onClick={(e) => {
                    const target = e.currentTarget.querySelector<HTMLInputElement>('input');
                    target?.focus();
                  }}
                >
                  {currentPhrases.map((phrase, i) => (
                    <Badge
                      key={`${phrase}-${i}`}
                      variant="secondary"
                      className="h-auto min-h-6 gap-1 py-0.5 pr-1"
                    >
                      <span className="whitespace-normal break-words">{phrase}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removePhrase(i);
                        }}
                        className="grid size-4 place-items-center rounded-full hover:bg-foreground/10"
                        aria-label={`Quitar ${phrase}`}
                      >
                        <XIcon className="size-3" />
                      </button>
                    </Badge>
                  ))}
                  <input
                    id="auto-conversion-trigger-phrase"
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={onDraftKeyDown}
                    onBlur={() => {
                      if (draft.trim().length > 0) addPhrase(draft);
                    }}
                    placeholder={
                      currentPhrases.length === 0 ? 'Ej: procesar' : 'Agregar otra frase...'
                    }
                    className="min-w-[10ch] flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
                  />
                </div>
                <FieldError
                  errors={[
                    form.formState.errors.phrases?.message
                      ? { message: form.formState.errors.phrases.message }
                      : undefined,
                  ]}
                />
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
                {updateTrigger.isPending ? 'Guardando...' : 'Guardar frases'}
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
  const money = useMoneyFormatter();
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

  const minPretty = formatGroup(current.min);
  const maxPretty = formatGroup(current.max);

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <WalletIcon className="size-4" />
          </div>
          <h3 className="font-medium leading-tight">Limites de monto ({money.code})</h3>
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
                      {money.symbol}
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
                    {minPretty ? `${money.symbol} ${minPretty} ${money.code}` : 'Sin minimo'}
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
                      {money.symbol}
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
                    {maxPretty ? `${money.symbol} ${maxPretty} ${money.code}` : 'Sin maximo'}
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
