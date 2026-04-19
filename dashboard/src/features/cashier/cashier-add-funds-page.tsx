import { useMemo } from 'react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckIcon } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDateTime } from '@/lib/format';
import {
  useCashierLeads,
  useConvertQueueLead,
  useCashierRuntimeState,
} from '@/features/cashier/cashier-hooks';
import { leadStatusLabel } from '@/lib/lead-status';
import { toApiError } from '@/api/http';

const schema = z.object({
  leadId: z.string().min(1, 'Selecciona un lead para cargar'),
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
  const { data: leads, isLoading } = useCashierLeads('CONTACTED');
  const convertLead = useConvertQueueLead();

  useEffect(() => {
    if (runtimeState && !runtimeState.canOperateLeads) {
      toast.error(
        `No puedes operar leads. Estado WAHA: ${runtimeState.wahaStatus}`,
      );
      navigate('/cashier', { replace: true });
    }
  }, [navigate, runtimeState]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      leadId: '',
      amount: '',
    },
  });

  const selectedLeadId = form.watch('leadId');
  const selectedLead = useMemo(
    () => leads?.find((lead) => lead.id === selectedLeadId) ?? null,
    [leads, selectedLeadId],
  );

  const canSubmit = useMemo(
    () => Boolean(selectedLead) && !convertLead.isPending,
    [convertLead.isPending, selectedLead],
  );

  const onSubmit = async (values: FormValues) => {
    try {
      await convertLead.mutateAsync({
        leadId: values.leadId,
        input: {
          amount: Number(values.amount),
        },
      });
      toast.success('Conversion registrada');
      form.reset({ leadId: '', amount: '' });
    } catch (error) {
      const apiError = toApiError(error);
      toast.error(apiError.message || 'No se pudo registrar la conversion');
    }
  };

  return (
    <section className='flex flex-col gap-4'>
      <PageHeader
        title='Cola de conversiones'
        description='Selecciona un lead contactado y carga el monto de conversion.'
      />

      <Card className='max-w-2xl'>
        <CardHeader>
          <CardTitle>Cargar conversion</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          {isLoading ? (
            <p className='text-sm text-muted-foreground'>
              Cargando leads disponibles...
            </p>
          ) : !leads || leads.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              No hay leads contactados disponibles para cargar.
            </p>
          ) : (
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className='flex flex-col gap-4'
            >
              <FieldGroup>
                <Field data-invalid={Boolean(form.formState.errors.leadId)}>
                  <FieldLabel htmlFor='leadId'>Lead a cargar</FieldLabel>
                  <FieldContent>
                    <Controller
                      control={form.control}
                      name='leadId'
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger
                            id='leadId'
                            aria-invalid={Boolean(
                              form.formState.errors.leadId,
                            )}
                          >
                            <SelectValue placeholder='Selecciona un lead' />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {leads.map((lead) => (
                                <SelectItem key={lead.id} value={lead.id}>
                                  {lead.code}
                                  {lead.phone ? ` - ${lead.phone}` : ''}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      )}
                    />
                    <FieldDescription>
                      Leads contactados disponibles para cargar conversion.
                    </FieldDescription>
                    <FieldError errors={[form.formState.errors.leadId]} />
                  </FieldContent>
                </Field>
              </FieldGroup>

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
                  {convertLead.isPending
                    ? 'Convirtiendo...'
                    : 'Confirmar conversion'}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </section>
  );
};
