import { useFieldArray, type useForm } from "react-hook-form";
import { PlusIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MAX_MESSAGES, MAX_MSG_LEN } from "./schemas";

type WhatsappMessagesEditorProps = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: ReturnType<typeof useForm<any>>;
  fieldArrayName: string;
};

/** List editor for the up-to-5 WhatsApp greeting messages, with live counters. */
export const WhatsappMessagesEditor = ({ form, fieldArrayName }: WhatsappMessagesEditorProps) => {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: fieldArrayName,
  });

  const errors = form.formState.errors[fieldArrayName] as
    | Array<{ message?: string } | undefined>
    | { message?: string }
    | undefined;

  const rootError =
    errors && !Array.isArray(errors) && "message" in errors
      ? (errors as { message?: string }).message
      : undefined;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Mensajes de WhatsApp</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={fields.length >= MAX_MESSAGES}
          onClick={() => append("")}
        >
          <PlusIcon data-icon="inline-start" />
          Agregar
        </Button>
      </div>

      {rootError && <p role="alert" className="text-sm text-destructive">{rootError}</p>}

      {fields.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Sin mensajes configurados. Máximo {MAX_MESSAGES}.
        </p>
      )}

      {fields.map((field, index) => {
        const rowError = Array.isArray(errors) ? errors[index]?.message : undefined;
        const val: string = form.watch(`${fieldArrayName}.${index}`) ?? "";
        return (
          <div key={field.id} className="flex items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Field data-invalid={Boolean(rowError)}>
                <FieldContent>
                  <Input
                    placeholder="Mensaje de bienvenida…"
                    aria-label={`Mensaje ${index + 1}`}
                    aria-invalid={Boolean(rowError)}
                    {...form.register(`${fieldArrayName}.${index}`)}
                  />
                  <span className="text-right text-xs text-muted-foreground">
                    {val.length}/{MAX_MSG_LEN}
                  </span>
                  {rowError && <FieldError errors={[{ message: rowError }]} />}
                </FieldContent>
              </Field>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Eliminar mensaje ${index + 1}`}
              onClick={() => remove(index)}
            >
              <Trash2Icon className="size-4 text-destructive" />
            </Button>
          </div>
        );
      })}

      <p className="text-xs text-muted-foreground">
        Cada mensaje se recorta y los vacíos se descartan al guardar. Máx {MAX_MSG_LEN} caracteres c/u.
      </p>
    </div>
  );
};
