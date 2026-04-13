import { useMemo } from 'react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckIcon, SkipForwardIcon } from 'lucide-react';
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
  useConvertQueueLead,
  useCashierRuntimeState,
  useQueueCurrentLead,
  useSkipQueueLead,
} from '@/features/cashier/cashier-hooks';
import { leadStatusLabel } from '@/lib/lead-status';
import { toApiError } from '@/api/http';

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
  const { data: currentLead, isLoading } = useQueueCurrentLead(
    runtimeState?.canOperateLeads ?? true,
  );
  const convertLead = useConvertQueueLead();
  const skipLead = useSkipQueueLead();

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
      amount: '',
    },
  });

  const canSubmit = useMemo(
    () => Boolean(currentLead) && !convertLead.isPending,
    [convertLead.isPending, currentLead],
  );

  const onSubmit = async (values: FormValues) => {
    if (!currentLead) {
      toast.error('No hay lead en cola para convertir');
      return;
    }

    try {
      await convertLead.mutateAsync({
        leadId: currentLead.id,
        input: {
          amount: Number(values.amount),
        },
      });
      toast.success('Conversion registrada');
      form.reset({ amount: '' });
    } catch (error) {
      const apiError = toApiError(error);
      toast.error(apiError.message || 'No se pudo registrar la conversion');
    }
  };

  const handleSkip = async () => {
    if (!currentLead) {
      return;
    }

    try {
      await skipLead.mutateAsync(currentLead.id);
      toast.success('Lead omitido');
    } catch {
      toast.error('No se pudo omitir el lead');
    }
  };

  return (
    <section className='flex flex-col gap-4'>
      <PageHeader
        title='Cola de conversiones'
        description='Procesa un lead contactado por vez: convertir u omitir.'
      />

      <Card className='max-w-2xl'>
        <CardHeader>
          <CardTitle>Lead actual</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          {isLoading ? (
            <p className='text-sm text-muted-foreground'>
              Cargando lead en cola...
            </p>
          ) : !currentLead ? (
            <p className='text-sm text-muted-foreground'>
              No hay leads contactados en cola.
            </p>
          ) : (
            <>
              <div className='flex flex-wrap gap-2'>
                <Badge variant='outline'>Codigo: {currentLead.code}</Badge>
                <Badge variant='outline'>
                  Estado: {leadStatusLabel(currentLead.status)}
                </Badge>
              </div>

              <div className='grid gap-2 rounded-lg border p-3 text-sm'>
                <p>
                  <span className='font-medium'>Telefono:</span>{' '}
                  {currentLead.phone ?? '-'}
                </p>
                <p>
                  <span className='font-medium'>Se contactó el</span>{' '}
                  {currentLead.contactedAt
                    ? formatDateTime(currentLead.contactedAt)
                    : '-'}
                </p>
              </div>

              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className='flex flex-col gap-4'
              >
                <FieldGroup>
                  <Field data-invalid={Boolean(form.formState.errors.amount)}>
                    <FieldLabel htmlFor='amount'>
                      Monto de conversion
                    </FieldLabel>
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
                  <Button
                    type='button'
                    variant='outline'
                    onClick={handleSkip}
                    disabled={skipLead.isPending}
                  >
                    <SkipForwardIcon data-icon='inline-start' />
                    Pasar lead
                  </Button>
                </div>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
};
