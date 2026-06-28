/**
 * SetupPage — first-run super-admin creation form.
 *
 * Rendered OUTSIDE <RouterProvider> by <SetupGate>, so useNavigate is unavailable.
 * After successful setup, we write the session to localStorage and use
 * window.location.assign('/admin') for navigation (hard reload, locked decision).
 *
 * On 201: persist { token, refreshToken, user } to localStorage["auth"], reload to /admin.
 * On 409: show "sistema ya inicializado" message with link to /login.
 * On 400: show field-level errors from server response.
 */
import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRoundIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { authService } from "@/api/auth.service";
import { BrandLogo, BrandAuthBackground } from "@/branding";
import type { AuthSession } from "@/types/domain";

const AUTH_STORAGE_KEY = "auth";

// Mirror worker's setupSchema (password min 8 chars per REQ-AUTH-SETUP-2)
const schema = z
  .object({
    name: z.string().min(1, "Nombre obligatorio"),
    username: z.string().min(1, "Usuario obligatorio"),
    password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
    confirmPassword: z.string().min(1, "Confirma tu contraseña"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof schema>;

type PageState = "form" | "already-initialized";

export const SetupPage = () => {
  const [pageState, setPageState] = useState<PageState>("form");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      username: "",
      password: "",
      confirmPassword: "",
    },
  });

  const handleSubmit = async (values: FormValues) => {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const session: AuthSession = await authService.runSetup({
        name: values.name,
        username: values.username,
        password: values.password,
      });

      // Persist session to localStorage in the same shape auth-context reads
      localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({ token: session.token, refreshToken: session.refreshToken, user: session.user }),
      );

      // Hard reload — window.location.assign is the locked navigation method here
      // because this component renders outside <RouterProvider>.
      window.location.assign("/admin");
    } catch (error: unknown) {
      const status =
        error && typeof error === "object" && "response" in error
          ? (error as { response?: { status?: number } }).response?.status
          : undefined;

      if (status === 409) {
        setPageState("already-initialized");
        return;
      }

      if (status === 400 && error && typeof error === "object" && "response" in error) {
        const responseData = (error as { response?: { data?: { message?: string } } }).response
          ?.data;
        setErrorMessage(responseData?.message ?? "Datos invalidos. Revisa los campos.");
      } else {
        setErrorMessage("No se pudo completar el setup. Intenta de nuevo.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (pageState === "already-initialized") {
    return (
      <div className="relative flex min-h-svh items-center justify-center px-4 py-8">
        <BrandAuthBackground />
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="gap-3">
            <BrandLogo className="h-9 w-auto object-contain" />
            <CardTitle className="font-heading text-2xl">Sistema ya inicializado</CardTitle>
            <CardDescription>
              El super admin ya fue creado. Podes{" "}
              <a href="/login" className="underline underline-offset-4">
                iniciar sesion
              </a>{" "}
              con tu cuenta.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-svh items-center justify-center px-4 py-8">
      <BrandAuthBackground />
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="gap-3">
          <BrandLogo className="h-9 w-auto object-contain" />
          <CardTitle className="font-heading text-2xl">Configuracion inicial</CardTitle>
          <CardDescription>
            Crea la cuenta del super administrador para comenzar a usar el sistema.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {errorMessage ? (
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}

          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="flex flex-col gap-4"
          >
            <FieldGroup>
              <Field data-invalid={Boolean(form.formState.errors.name)}>
                <FieldLabel htmlFor="setup-name">Nombre</FieldLabel>
                <FieldContent>
                  <Input
                    id="setup-name"
                    autoComplete="name"
                    aria-invalid={Boolean(form.formState.errors.name)}
                    {...form.register("name")}
                  />
                  <FieldError errors={[form.formState.errors.name]} />
                </FieldContent>
              </Field>

              <Field data-invalid={Boolean(form.formState.errors.username)}>
                <FieldLabel htmlFor="setup-username">Usuario</FieldLabel>
                <FieldContent>
                  <Input
                    id="setup-username"
                    autoComplete="username"
                    aria-invalid={Boolean(form.formState.errors.username)}
                    {...form.register("username")}
                  />
                  <FieldError errors={[form.formState.errors.username]} />
                </FieldContent>
              </Field>

              <Field data-invalid={Boolean(form.formState.errors.password)}>
                <FieldLabel htmlFor="setup-password">Contraseña</FieldLabel>
                <FieldContent>
                  <Input
                    id="setup-password"
                    type="password"
                    autoComplete="new-password"
                    aria-invalid={Boolean(form.formState.errors.password)}
                    {...form.register("password")}
                  />
                  <FieldError errors={[form.formState.errors.password]} />
                </FieldContent>
              </Field>

              <Field data-invalid={Boolean(form.formState.errors.confirmPassword)}>
                <FieldLabel htmlFor="setup-confirm-password">Confirmar contraseña</FieldLabel>
                <FieldContent>
                  <Input
                    id="setup-confirm-password"
                    type="password"
                    autoComplete="new-password"
                    aria-invalid={Boolean(form.formState.errors.confirmPassword)}
                    {...form.register("confirmPassword")}
                  />
                  <FieldError errors={[form.formState.errors.confirmPassword]} />
                </FieldContent>
              </Field>
            </FieldGroup>

            <Button type="submit" disabled={isSubmitting}>
              <KeyRoundIcon data-icon="inline-start" />
              {isSubmitting ? "Configurando..." : "Crear super admin"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
