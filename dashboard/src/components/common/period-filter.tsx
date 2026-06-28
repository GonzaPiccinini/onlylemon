import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarIcon, CalendarSearchIcon } from "lucide-react";
import { AccentIconBadge, IconBadge } from "@/components/common/icon-badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
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
      className="glass rounded-2xl p-4 animate-in fade-in slide-in-from-bottom-2 duration-500"
    >
      <div className="mb-3 flex items-center gap-2">
        <AccentIconBadge size="sm">
          <CalendarSearchIcon className="h-3.5 w-3.5" aria-hidden="true" />
        </AccentIconBadge>
        <span className="text-sm font-medium text-muted-foreground">Filtrar por período</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field data-invalid={Boolean(form.formState.errors.from)} className="gap-1.5">
          <div className="flex items-center gap-1.5">
            <IconBadge>
              <CalendarIcon className="size-3.5" />
            </IconBadge>
            <span className="text-xs font-semibold text-foreground/80">Desde</span>
          </div>
          <Input id="from" type="date" className="appearance-none transition-all duration-200 md:appearance-auto" aria-invalid={Boolean(form.formState.errors.from)} {...form.register("from")} />
          <FieldError errors={[form.formState.errors.from]} />
        </Field>

        <Field data-invalid={Boolean(form.formState.errors.to)} className="gap-1.5">
          <div className="flex items-center gap-1.5">
            <IconBadge>
              <CalendarIcon className="size-3.5" />
            </IconBadge>
            <span className="text-xs font-semibold text-foreground/80">Hasta</span>
          </div>
          <Input id="to" type="date" className="appearance-none transition-all duration-200 md:appearance-auto" aria-invalid={Boolean(form.formState.errors.to)} {...form.register("to")} />
          <FieldError errors={[form.formState.errors.to]} />
        </Field>

        <div className="flex flex-col justify-end">
          <Button type="submit">Aplicar</Button>
        </div>
      </div>
    </form>
  );
};
