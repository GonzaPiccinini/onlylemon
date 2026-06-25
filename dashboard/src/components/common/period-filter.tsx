import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { DateRangeFilters } from "@/types/domain";

const schema = z
  .object({
    from: z.string().min(1, "Fecha desde requerida"),
    to: z.string().min(1, "Fecha hasta requerida"),
  })
  .refine((value) => value.from <= value.to, {
    message: "La fecha desde no puede ser mayor a la fecha hasta",
    path: ["to"],
  });

type FormValues = z.infer<typeof schema>;

interface PeriodFilterProps {
  value: DateRangeFilters;
  onChange: (next: DateRangeFilters) => void;
}

export const PeriodFilter = ({ value, onChange }: PeriodFilterProps) => {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      from: value.from,
      to: value.to,
    },
  });

  const handleSubmit = (values: FormValues) => {
    onChange({ ...value, ...values });
  };

  return (
    <form
      onSubmit={form.handleSubmit(handleSubmit)}
      className="rounded-xl border bg-card p-4"
    >
      <FieldGroup className="gap-4 md:grid md:grid-cols-[1fr_1fr_auto] md:items-end">
        <Field data-invalid={Boolean(form.formState.errors.from)}>
          <FieldLabel htmlFor="from">Desde</FieldLabel>
          <FieldContent>
            <Input id="from" type="date" className="appearance-none md:appearance-auto" aria-invalid={Boolean(form.formState.errors.from)} {...form.register("from")} />
            <FieldError errors={[form.formState.errors.from]} />
          </FieldContent>
        </Field>

        <Field data-invalid={Boolean(form.formState.errors.to)}>
          <FieldLabel htmlFor="to">Hasta</FieldLabel>
          <FieldContent>
            <Input id="to" type="date" className="appearance-none md:appearance-auto" aria-invalid={Boolean(form.formState.errors.to)} {...form.register("to")} />
            <FieldError errors={[form.formState.errors.to]} />
          </FieldContent>
        </Field>

        <Field>
          <Button type="submit">Aplicar periodo</Button>
          <FieldDescription>Actualiza estadisticas por rango</FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  );
};
