import { useMemo, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckIcon, CircleDollarSignIcon, SearchIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';
import { IconBadge } from '@/components/common/icon-badge';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/common/status-badge';
import { Separator } from '@/components/ui/separator';
import { useMoneyFormatter } from '@/lib/use-currency';
import { formatDateTime } from '@/lib/format';
import {
  useSearchCashierLeads,
  useCreateConversion,
  useCashierRuntimeState,
  useCashierConversionLimits,
} from '@/features/cashier/cashier-hooks';
import { leadStatusBadge, leadStatusLabel } from '@/lib/lead-status';
import { toApiError } from '@/api/http';
import type { Lead } from '@/types/domain';

const buildAmountSchema = (limits: { min: number; max: number }) =>
  z.object({
    amount: z
      .string()
      .trim()
      .min(1, 'El monto es obligatorio')
      .superRefine((value, ctx) => {
        const num = Number(value);
        if (Number.isNaN(num) || !Number.isInteger(num) || num <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Debe ser un numero entero positivo',
          });
          return;
        }
        if (limits.min > 0 && num < limits.min) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `El monto minimo es ${limits.min}`,
          });
        }
        if (limits.max > 0 && num > limits.max) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `El monto maximo es ${limits.max}`,
          });
        }
      }),
  });

type FormValues = { amount: string };

export const CashierAddFundsPage = () => {
  const money = useMoneyFormatter();
  const navigate = useNavigate();
  const { data: runtimeState } = useCashierRuntimeState();
  const { data: limitsData } = useCashierConversionLimits();
  const limits = limitsData ?? { min: 0, max: 0 };
  const [query, setQuery] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const createConversion = useCreateConversion();

  useEffect(() => {
    if (runtimeState && !runtimeState.canOperateLeads) {
      toast.error('No podés operar leads: necesitás un WhatsApp conectado.');
      navigate('/cashier', { replace: true });
    }
  }, [navigate, runtimeState]);

  // Debounce query → debouncedQ with ~250ms
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      setDebouncedQ(query);
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const { data: searchResults = [], isFetching: searching } =
    useSearchCashierLeads(debouncedQ);

  const amountSchema = useMemo(() => buildAmountSchema(limits), [limits]);

  const form = useForm<FormValues>({
    resolver: zodResolver(amountSchema),
    defaultValues: {
      amount: '',
    },
    mode: 'onChange',
  });

  useEffect(() => {
    if (form.formState.isDirty || form.formState.isSubmitted) {
      void form.trigger('amount');
    }
  }, [limits.min, limits.max, form]);

  const canSubmit = useMemo(
    () => Boolean(selectedLead) && !createConversion.isPending,
    [createConversion.isPending, selectedLead],
  );

  const handleSelectLead = (lead: Lead) => {
    setSelectedLead(lead);
    setQuery('');
    setDebouncedQ('');
  };

  const handleClearLead = () => {
    setSelectedLead(null);
    setQuery('');
    setDebouncedQ('');
  };

  const onSubmit = async (values: FormValues) => {
    if (!selectedLead) return;
    try {
      await createConversion.mutateAsync({
        leadId: selectedLead.id,
        input: {
          amount: Number(values.amount),
        },
      });
      toast.success('Conversion registrada');
      form.reset({ amount: '' });
      setSelectedLead(null);
    } catch (error) {
      const apiError = toApiError(error);
      toast.error(apiError.message || 'No se pudo registrar la conversion');
    }
  };

  return (
    <section className='flex flex-col gap-4'>
      <PageHeader
        title='Cargar conversion'
        description='Busca un lead por codigo o telefono y carga el monto de conversion.'
      />

      <Card className='max-w-3xl'>

        <CardContent className='flex flex-col gap-5 sm:gap-6'>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className='flex flex-col gap-5 sm:gap-6'
          >
            {/* Section: lead search / selection */}
            <div className='flex flex-col gap-3 sm:gap-4'>
              <div className='flex flex-col gap-2'>
                <div className='flex items-center gap-2'>
                  <IconBadge size="md">
                    <SearchIcon className='size-4' />
                  </IconBadge>
                  <h3 className='font-medium leading-tight'>Buscar lead</h3>
                </div>
                <p className='text-sm text-muted-foreground'>
                  Busca el lead por codigo o telefono y seleccionalo para cargar
                  la conversion.
                </p>
              </div>

              <FieldGroup>
                <Field>
                  <FieldContent>
                    {selectedLead ? (
                      <div className='flex items-center justify-between gap-2 rounded-lg border px-3 py-2'>
                        <span className='text-sm font-medium'>
                          {selectedLead.code}
                          {selectedLead.phone ? ` · ${selectedLead.phone}` : ''}
                        </span>
                        <Button
                          type='button'
                          variant='ghost'
                          size='sm'
                          onClick={handleClearLead}
                          className='h-6 w-6 p-0'
                          aria-label='Limpiar lead seleccionado'
                        >
                          <XIcon className='h-4 w-4' />
                        </Button>
                      </div>
                    ) : (
                      <div className='relative'>
                        <div className='relative'>
                          <SearchIcon className='absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground' />
                          <Input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder='Buscar por codigo o telefono...'
                            className='pl-8'
                            autoComplete='off'
                          />
                        </div>
                        {/* Results panel */}
                        {debouncedQ.length > 0 && (
                          <div className='absolute inset-x-0 top-full z-20 mt-1 rounded-lg border bg-popover shadow-sm'>
                            {searching ? (
                              <ul className='divide-y'>
                                {Array.from({ length: 3 }).map((_, i) => (
                                  <li
                                    key={i}
                                    className='flex items-center gap-3 px-3 py-2'
                                  >
                                    <Skeleton className='h-4 w-16' />
                                    <Skeleton className='h-4 w-24' />
                                    <Skeleton className='ml-auto h-5 w-20 rounded-full' />
                                  </li>
                                ))}
                              </ul>
                            ) : searchResults.length === 0 ? (
                              <p className='px-3 py-2 text-sm text-muted-foreground'>
                                No se encontraron leads
                              </p>
                            ) : (
                              <ul className='divide-y'>
                                {searchResults.map((lead) => (
                                  <li key={lead.id}>
                                    <button
                                      type='button'
                                      onClick={() => handleSelectLead(lead)}
                                      className='flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
                                    >
                                      <span className='font-medium'>
                                        {lead.code}
                                      </span>
                                      {lead.phone && (
                                        <span className='text-muted-foreground'>
                                          {lead.phone}
                                        </span>
                                      )}
                                      <StatusBadge
                                        variant={
                                          leadStatusBadge(lead.status).variant
                                        }
                                        icon={leadStatusBadge(lead.status).icon}
                                        className='ml-auto'
                                      >
                                        {leadStatusLabel(lead.status)}
                                      </StatusBadge>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </FieldContent>
                </Field>
              </FieldGroup>

              {/* Selected lead details */}
              {selectedLead && (
                <div className='flex flex-col gap-2'>
                  <div className='flex flex-wrap gap-2'>
                    <Badge variant='outline'>Codigo: {selectedLead.code}</Badge>
                    <StatusBadge
                      variant={leadStatusBadge(selectedLead.status).variant}
                      icon={leadStatusBadge(selectedLead.status).icon}
                    >
                      Estado: {leadStatusLabel(selectedLead.status)}
                    </StatusBadge>
                  </div>

                  <div className='grid gap-2 rounded-lg border p-3 text-sm'>
                    <p>
                      <span className='font-medium'>Telefono:</span>{' '}
                      {selectedLead.phone ?? '-'}
                    </p>
                    <p>
                      <span className='font-medium'>Se contactó el</span>{' '}
                      {selectedLead.contactedAt
                        ? formatDateTime(selectedLead.contactedAt)
                        : '-'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* Section: amount */}
            <div className='flex flex-col gap-3 sm:gap-4'>
              <div className='flex flex-col gap-2'>
                <div className='flex items-center gap-2'>
                  <IconBadge size="md">
                    <CircleDollarSignIcon className='size-4' />
                  </IconBadge>
                  <h3 className='font-medium leading-tight'>Monto</h3>
                </div>
                <p className='text-sm text-muted-foreground'>
                  Ingresa el valor de la conversion a registrar para el lead
                  seleccionado.
                </p>
              </div>

              <FieldGroup>
                <Field data-invalid={Boolean(form.formState.errors.amount)}>
                  <FieldLabel htmlFor='amount'>Monto de conversion</FieldLabel>
                  <FieldContent>
                    <Input
                      id='amount'
                      type='number'
                      min={limits.min > 0 ? limits.min : 1}
                      max={limits.max > 0 ? limits.max : undefined}
                      step={1}
                      placeholder='Ingresa el monto'
                      aria-invalid={Boolean(form.formState.errors.amount)}
                      {...form.register('amount')}
                    />
                    <FieldDescription>
                      {limits.min > 0 && limits.max > 0
                        ? `Rango permitido: ${money.format(limits.min)} – ${money.format(limits.max)}.`
                        : limits.min > 0
                          ? `Monto minimo: ${money.format(limits.min)}.`
                          : limits.max > 0
                            ? `Monto maximo: ${money.format(limits.max)}.`
                            : 'Valor reportado de conversion.'}
                    </FieldDescription>
                    <FieldError errors={[form.formState.errors.amount]} />
                  </FieldContent>
                </Field>
              </FieldGroup>

              <div className='flex flex-wrap gap-2'>
                <Button type='submit' disabled={!canSubmit}>
                  <CheckIcon data-icon='inline-start' />
                  {createConversion.isPending
                    ? 'Convirtiendo...'
                    : 'Confirmar conversion'}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </section>
  );
};
