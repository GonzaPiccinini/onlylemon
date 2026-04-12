import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useUpdateCashierAccount } from '@/features/cashier/cashier-hooks';

const schema = z
  .object({
    username: z.string().trim().optional(),
    password: z.string().optional(),
  })
  .refine((values) => Boolean(values.username?.trim() || values.password), {
    message: 'Debes ingresar al menos un campo para actualizar',
    path: ['username'],
  })
  .refine((values) => !values.username || values.username.trim().length >= 3, {
    message: 'El usuario debe tener al menos 3 caracteres',
    path: ['username'],
  })
  .refine((values) => !values.password || values.password.length >= 6, {
    message: 'La password debe tener al menos 6 caracteres',
    path: ['password'],
  });

type FormValues = z.infer<typeof schema>;

export const CashierAccountPage = () => {
  const updateAccount = useUpdateCashierAccount();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      username: '',
      password: '',
    },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      await updateAccount.mutateAsync({
        ...(values.username?.trim() ? { username: values.username.trim() } : {}),
        ...(values.password ? { password: values.password } : {}),
      });
      toast.success('Cuenta actualizada');
      form.reset({ username: '', password: '' });
    } catch {
      toast.error('No se pudo actualizar la cuenta');
    }
  };

  return (
    <section className='flex flex-col gap-4'>
      <PageHeader
        title='Mi cuenta'
        description='Actualiza tu usuario y password.'
      />

      <Card className='max-w-2xl'>
        <CardHeader>
          <CardTitle>Credenciales</CardTitle>
          <CardDescription>
            Puedes cambiar tu usuario y password en cualquier momento.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className='flex flex-col gap-4'>
            <FieldGroup>
              <Field data-invalid={Boolean(form.formState.errors.username)}>
                <FieldLabel htmlFor='account-username'>Usuario</FieldLabel>
                <FieldContent>
                  <Input
                    id='account-username'
                    {...form.register('username')}
                    aria-invalid={Boolean(form.formState.errors.username)}
                  />
                  <FieldError errors={[form.formState.errors.username]} />
                </FieldContent>
              </Field>

              <Field data-invalid={Boolean(form.formState.errors.password)}>
                <FieldLabel htmlFor='account-password'>Password</FieldLabel>
                <FieldContent>
                  <Input
                    id='account-password'
                    type='password'
                    {...form.register('password')}
                    aria-invalid={Boolean(form.formState.errors.password)}
                  />
                  <FieldError errors={[form.formState.errors.password]} />
                </FieldContent>
              </Field>
            </FieldGroup>

            <Button type='submit' className='w-fit' disabled={updateAccount.isPending}>
              {updateAccount.isPending ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </section>
  );
};
