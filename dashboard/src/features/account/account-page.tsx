import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { CircleUserRoundIcon, KeyRoundIcon } from "lucide-react";
import { IconBadge } from "@/components/common/icon-badge";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
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
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/features/auth/auth-context";
import type { Role } from "@/types/domain";

const schema = z
  .object({
    username: z.string().trim().optional(),
    password: z.string().optional(),
  })
  .refine((values) => Boolean(values.username?.trim() || values.password), {
    message: "Debes ingresar al menos un campo para actualizar",
    path: ["username"],
  })
  .refine((values) => !values.username || values.username.trim().length >= 3, {
    message: "El usuario debe tener al menos 3 caracteres",
    path: ["username"],
  })
  .refine((values) => !values.password || values.password.length >= 6, {
    message: "La password debe tener al menos 6 caracteres",
    path: ["password"],
  });

type FormValues = z.infer<typeof schema>;

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Administrador",
  SUPER_ADMIN: "Super admin",
  CASHIER: "Cajero",
};

export interface AccountUpdateMutation {
  mutateAsync: (input: {
    username?: string;
    password?: string;
  }) => Promise<unknown>;
  isPending: boolean;
}

interface AccountPageProps {
  /** Prefix for input ids so labels stay correctly associated per role. */
  idPrefix: string;
  updateAccount: AccountUpdateMutation;
}

export const AccountPage = ({ idPrefix, updateAccount }: AccountPageProps) => {
  const { user } = useAuth();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const isDirty = form.formState.isDirty;

  const onSubmit = async (values: FormValues) => {
    try {
      await updateAccount.mutateAsync({
        ...(values.username?.trim() ? { username: values.username.trim() } : {}),
        ...(values.password ? { password: values.password } : {}),
      });
      toast.success("Cuenta actualizada");
      form.reset({ username: "", password: "" });
    } catch {
      toast.error("No se pudo actualizar la cuenta");
    }
  };

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        title="Mi cuenta"
        description="Consulta tu identidad y actualiza tus datos de acceso."
      />

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Mi cuenta</CardTitle>
          <CardDescription>
            Tu identidad en el sistema y las credenciales con las que ingresas.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5 sm:gap-6">
          <div className="flex flex-col gap-3 sm:gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <IconBadge size="md">
                  <CircleUserRoundIcon className="size-4" />
                </IconBadge>
                <div className="flex flex-col gap-0.5">
                  <h3 className="font-medium leading-tight">{user?.name ?? "—"}</h3>
                  <span className="text-xs text-muted-foreground">Usuario: {user?.username ?? "—"}</span>
                </div>
                {user ? (
                  <Badge variant="secondary">{ROLE_LABEL[user.role]}</Badge>
                ) : null}
              </div>
            </div>
          </div>

          <Separator />

          <div className="flex flex-col gap-3 sm:gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <IconBadge size="md">
                  <KeyRoundIcon className="size-4" />
                </IconBadge>
                <h3 className="font-medium leading-tight">Credenciales</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Cambia tu usuario o tu password. Completa solo lo que quieras
                actualizar.
              </p>
            </div>

            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="flex flex-col gap-4"
            >
              <FieldGroup>
                <Field data-invalid={Boolean(form.formState.errors.username)}>
                  <FieldLabel htmlFor={`${idPrefix}-username`}>
                    Usuario
                  </FieldLabel>
                  <FieldContent>
                    <Input
                      id={`${idPrefix}-username`}
                      {...form.register("username")}
                      aria-invalid={Boolean(form.formState.errors.username)}
                    />
                    <FieldError errors={[form.formState.errors.username]} />
                  </FieldContent>
                </Field>

                <Field data-invalid={Boolean(form.formState.errors.password)}>
                  <FieldLabel htmlFor={`${idPrefix}-password`}>
                    Password
                  </FieldLabel>
                  <FieldContent>
                    <Input
                      id={`${idPrefix}-password`}
                      type="password"
                      {...form.register("password")}
                      aria-invalid={Boolean(form.formState.errors.password)}
                    />
                    <FieldError errors={[form.formState.errors.password]} />
                  </FieldContent>
                </Field>
              </FieldGroup>

              {isDirty ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={updateAccount.isPending}
                    className="flex-1 sm:flex-none"
                  >
                    {updateAccount.isPending ? "Guardando..." : "Guardar cambios"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => form.reset({ username: "", password: "" })}
                    disabled={updateAccount.isPending}
                    className="flex-1 sm:flex-none"
                  >
                    Cancelar
                  </Button>
                </div>
              ) : null}
            </form>
          </div>
        </CardContent>
      </Card>
    </section>
  );
};
