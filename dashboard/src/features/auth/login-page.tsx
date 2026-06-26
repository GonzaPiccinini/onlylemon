import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRoundIcon } from 'lucide-react';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/features/auth/auth-context';
import { BrandLogo, BrandAuthBackground } from '@/branding';

const schema = z.object({
  username: z.string().min(1, 'Usuario obligatorio'),
  password: z.string().min(1, 'Password obligatoria'),
});

type FormValues = z.infer<typeof schema>;

export const LoginPage = () => {
  const { login, isLoggingIn } = useAuth();
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      username: '',
      password: '',
    },
  });

  const handleSubmit = async (values: FormValues) => {
    setErrorMessage(null);
    try {
      await login(values);
      navigate('/', { replace: true });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'No se pudo iniciar sesion',
      );
    }
  };

  return (
    <div className='relative flex min-h-svh items-center justify-center px-4 py-8'>
      <BrandAuthBackground />
      <Card className='w-full max-w-md shadow-lg'>
        <CardHeader className='gap-3'>
          <BrandLogo className='h-9 w-auto object-contain' />
          <CardTitle className='font-heading text-2xl'>
            Acceso al dashboard
          </CardTitle>
          <CardDescription>
            Autenticate para operar como administrador o cajero.
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          {errorMessage ? (
            <Alert variant='destructive'>
              <AlertTitle>Error de autenticacion</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}

          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className='flex flex-col gap-4'
          >
            <FieldGroup>
              <Field data-invalid={Boolean(form.formState.errors.username)}>
                <FieldLabel htmlFor='username'>Usuario</FieldLabel>
                <FieldContent>
                  <Input
                    id='username'
                    autoComplete='username'
                    aria-invalid={Boolean(form.formState.errors.username)}
                    {...form.register('username')}
                  />
                  <FieldError errors={[form.formState.errors.username]} />
                </FieldContent>
              </Field>

              <Field data-invalid={Boolean(form.formState.errors.password)}>
                <FieldLabel htmlFor='password'>Password</FieldLabel>
                <FieldContent>
                  <Input
                    id='password'
                    type='password'
                    autoComplete='current-password'
                    aria-invalid={Boolean(form.formState.errors.password)}
                    {...form.register('password')}
                  />
                  <FieldError errors={[form.formState.errors.password]} />
                </FieldContent>
              </Field>
            </FieldGroup>

            <Button type='submit' disabled={isLoggingIn}>
              <KeyRoundIcon data-icon='inline-start' />
              {isLoggingIn ? 'Ingresando...' : 'Iniciar sesion'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
