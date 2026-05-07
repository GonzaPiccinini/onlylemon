import { useMemo, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckIcon, SearchIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { formatDateTime } from '@/lib/format';
import {
  useSearchCashierLeads,
  useCreateConversion,
  useCashierRuntimeState,
} from '@/features/cashier/cashier-hooks';
import { leadStatusLabel } from '@/lib/lead-status';
import { toApiError } from '@/api/http';
import type { Lead } from '@/types/domain';

const schema = z.object({
  amount: z
    .string()
    .trim()
    .min(1, 'El monto es obligatorio')
    .refine((value) => !Number.isNaN(Number(value)) && Number(value) >= 3000, {
      message: 'El monto minimo es 3000',
    }),
});

type FormValues = z.infer<typeof schema>;

export const CashierAddFundsPage = () => {
  const navigate = useNavigate();
  const { data: runtimeState } = useCashierRuntimeState();
  const [query, setQuery] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const createConversion = useCreateConversion();

  useEffect(() => {
    if (runtimeState && !runtimeState.canOperateLeads) {
      toast.error(
        `No puedes operar leads. Estado WAHA: ${runtimeState.wahaStatus}`,
      );
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

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      amount: '',
    },
  });

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

      <Card className='max-w-2xl'>
        <CardHeader>
          <CardTitle>Cargar conversion</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className='flex flex-col gap-4'
          >
            {/* Lead search / selection */}
            <FieldGroup>
              <Field>
                <FieldLabel>Lead a cargar</FieldLabel>
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
                      >
                        <XIcon className='h-4 w-4' />
                      </Button>
                    </div>
                  ) : (
                    <>
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
                        <div className='mt-1 rounded-lg border bg-popover shadow-sm'>
                          {searching ? (
                            <p className='px-3 py-2 text-sm text-muted-foreground'>
                              Buscando...
                            </p>
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
                                    className='flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors'
                                  >
                                    <span className='font-medium'>
                                      {lead.code}
                                    </span>
                                    {lead.phone && (
                                      <span className='text-muted-foreground'>
                                        {lead.phone}
                                      </span>
                                    )}
                                    <Badge variant='outline' className='ml-auto'>
                                      {leadStatusLabel(lead.status)}
                                    </Badge>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                      {debouncedQ.length === 0 && (
                        <FieldDescription>
                          Ingresa el codigo o telefono del lead para buscarlo.
                        </FieldDescription>
                      )}
                    </>
                  )}
                </FieldContent>
              </Field>
            </FieldGroup>

            {/* Selected lead details */}
            {selectedLead && (
              <>
                <div className='flex flex-wrap gap-2'>
                  <Badge variant='outline'>Codigo: {selectedLead.code}</Badge>
                  <Badge variant='outline'>
                    Estado: {leadStatusLabel(selectedLead.status)}
                  </Badge>
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
              </>
            )}

            {/* Amount field — always shown */}
            <FieldGroup>
              <Field data-invalid={Boolean(form.formState.errors.amount)}>
                <FieldLabel htmlFor='amount'>Monto de conversion</FieldLabel>
                <FieldContent>
                  <Input
                    id='amount'
                    type='number'
                    min={3000}
                    step={1}
                    placeholder='Ingresa el monto'
                    aria-invalid={Boolean(form.formState.errors.amount)}
                    {...form.register('amount')}
                  />
                  <FieldDescription>
                    Valor reportado de conversion. Minimo 3000.
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
          </form>
        </CardContent>
      </Card>
    </section>
  );
};
