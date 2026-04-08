import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CircleDollarSignIcon } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAddFunds, useClientPhones } from '@/features/cashier/cashier-hooks';

const schema = z.object({
  userName: z.string().min(2, 'Nombre de usuario obligatorio'),
  phoneId: z.string().min(1, 'Telefono obligatorio'),
  phoneNumber: z.string().min(1, 'Telefono obligatorio'),
  amount: z.number().positive('El monto debe ser mayor a 0'),
});

type FormValues = z.infer<typeof schema>;

export const CashierAddFundsPage = () => {
  const addFunds = useAddFunds();
  const { data: clientPhones = [], isLoading: phonesLoading } =
    useClientPhones();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      userName: '',
      phoneId: '',
      phoneNumber: '',
      amount: 0,
    },
  });

  const selectedPhoneNumber = form.watch('phoneNumber');

  const handlePhoneChange = (value: string | null) => {
    if (!value) {
      form.setValue('phoneId', '', { shouldValidate: true });
      form.setValue('phoneNumber', '', { shouldValidate: true });
      return;
    }

    const selected = clientPhones.find((item) => item.phoneId === value);
    if (!selected) {
      form.setValue('phoneId', '', { shouldValidate: true });
      form.setValue('phoneNumber', '', { shouldValidate: true });
      return;
    }

    form.setValue('phoneId', selected.phoneId, { shouldValidate: true });
    form.setValue('phoneNumber', selected.phoneNumber, {
      shouldValidate: true,
    });
  };

  const onSubmit = async (values: FormValues) => {
    try {
      await addFunds.mutateAsync(values);
      toast.success('Carga registrada correctamente');
      form.reset({ userName: '', phoneId: '', phoneNumber: '', amount: 0 });
    } catch {
      toast.error('No se pudo registrar la carga');
    }
  };

  return (
    <section className='flex flex-col gap-4'>
      <PageHeader
        title='Registrar carga de saldo'
        description='Ingresa nombre del usuario, telefono y monto para registrar la operación.'
      />

      <Card className='max-w-2xl'>
        <CardHeader>
          <CardTitle>Nueva carga</CardTitle>
          <CardDescription>
            Ingresá los datos para registrar una nueva carga.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className='flex flex-col gap-4'
          >
            <FieldGroup>
              <Field data-invalid={Boolean(form.formState.errors.userName)}>
                <FieldLabel htmlFor='user-name'>Nombre del usuario</FieldLabel>
                <FieldContent>
                  <Input
                    id='user-name'
                    aria-invalid={Boolean(form.formState.errors.userName)}
                    {...form.register('userName')}
                  />
                  <FieldError errors={[form.formState.errors.userName]} />
                </FieldContent>
              </Field>

              <Field data-invalid={Boolean(form.formState.errors.phoneId)}>
                <FieldLabel htmlFor='phone'>Telefono asociado</FieldLabel>
                <FieldContent>
                  <Select
                    value={selectedPhoneNumber}
                    onValueChange={handlePhoneChange}
                  >
                    <SelectTrigger
                      id='phone'
                      aria-invalid={Boolean(form.formState.errors.phoneId)}
                      className='w-full'
                    >
                      <SelectValue
                        placeholder={
                          phonesLoading
                            ? 'Cargando telefonos...'
                            : 'Selecciona un telefono'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {clientPhones.map((phone) => (
                          <SelectItem key={phone.phoneId} value={phone.phoneId}>
                            {phone.phoneNumber}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    Seleccioná el número de teléfono del usuario.
                  </FieldDescription>
                  <FieldError errors={[form.formState.errors.phoneId]} />
                </FieldContent>
              </Field>

              <Field data-invalid={Boolean(form.formState.errors.amount)}>
                <FieldLabel htmlFor='amount'>Monto</FieldLabel>
                <FieldContent>
                  <Input
                    id='amount'
                    type='number'
                    min={1}
                    step={1}
                    aria-invalid={Boolean(form.formState.errors.amount)}
                    {...form.register('amount', {
                      setValueAs: (value: string) => Number(value),
                    })}
                  />
                  <FieldDescription>Monto en ARS.</FieldDescription>
                  <FieldError errors={[form.formState.errors.amount]} />
                </FieldContent>
              </Field>
            </FieldGroup>

            <Button
              type='submit'
              className='w-fit'
              disabled={
                addFunds.isPending || phonesLoading || clientPhones.length === 0
              }
            >
              <CircleDollarSignIcon data-icon='inline-start' />
              {addFunds.isPending ? 'Registrando...' : 'Registrar carga'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </section>
  );
};
