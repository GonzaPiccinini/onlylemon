import { useState } from "react";
import { PencilLineIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { Landing, LandingFallbackPhone } from "@/types/domain";
import {
  useCreateLandingFallbackPhone,
  useDeleteLandingFallbackPhone,
  useLandingFallbackPhones,
  useUpdateLandingFallbackPhone,
} from "@/features/admin/admin-hooks";
import { PHONE_REGEX } from "./schemas";

const isLastFallbackError = (err: unknown): boolean => {
  if (!err || typeof err !== "object") return false;
  const e = err as { response?: { status?: number; data?: { error?: string } } };
  return e.response?.status === 409 && e.response?.data?.error === "LAST_FALLBACK";
};

type FallbackPhonesEditorProps = {
  landing: Landing;
};

/**
 * Inline manager for a landing's fallback phones — add / edit / delete against
 * the fallback endpoints. Deleting the LAST fallback is blocked by the API
 * (409 LAST_FALLBACK); that guard is surfaced inline on the affected row.
 */
export const FallbackPhonesEditor = ({ landing }: FallbackPhonesEditorProps) => {
  const { data: phones = [], isLoading } = useLandingFallbackPhones(landing.id);
  const createPhone = useCreateLandingFallbackPhone(landing.id);
  const updatePhone = useUpdateLandingFallbackPhone(landing.id);
  const deletePhone = useDeleteLandingFallbackPhone(landing.id);

  const [addPhone, setAddPhone] = useState("");
  const [addLabel, setAddLabel] = useState("");
  const [addPhoneError, setAddPhoneError] = useState("");
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPhone, setEditPhone] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editPhoneError, setEditPhoneError] = useState("");

  const handleAdd = async () => {
    if (!PHONE_REGEX.test(addPhone)) {
      setAddPhoneError("Formato inválido (8–15 dígitos, + opcional)");
      return;
    }
    setAddPhoneError("");
    try {
      await createPhone.mutateAsync({ phone: addPhone, label: addLabel || undefined });
      setAddPhone("");
      setAddLabel("");
      toast.success("Teléfono de respaldo agregado");
    } catch {
      toast.error("No se pudo agregar el teléfono de respaldo");
    }
  };

  const handleDelete = async (phone: LandingFallbackPhone) => {
    setDeleteErrors((prev) => ({ ...prev, [phone.id]: "" }));
    try {
      await deletePhone.mutateAsync(phone.id);
      toast.success("Teléfono eliminado");
    } catch (err) {
      if (isLastFallbackError(err)) {
        setDeleteErrors((prev) => ({
          ...prev,
          [phone.id]: "Debes agregar otro respaldo antes de eliminar este",
        }));
      } else {
        toast.error("No se pudo eliminar el teléfono de respaldo");
      }
    }
  };

  const startEdit = (phone: LandingFallbackPhone) => {
    setEditingId(phone.id);
    setEditPhone(phone.phone);
    setEditLabel(phone.label ?? "");
    setEditPhoneError("");
  };

  const handleUpdate = async (id: string) => {
    if (!PHONE_REGEX.test(editPhone)) {
      setEditPhoneError("Formato inválido (8–15 dígitos, + opcional)");
      return;
    }
    setEditPhoneError("");
    try {
      await updatePhone.mutateAsync({
        id,
        patch: { phone: editPhone, label: editLabel || null },
      });
      setEditingId(null);
      toast.success("Teléfono actualizado");
    } catch {
      toast.error("No se pudo actualizar el teléfono de respaldo");
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-3/4" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {phones.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay teléfonos de respaldo registrados.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {phones.map((phone) => (
            <div key={phone.id} className="flex flex-col gap-1">
              {editingId === phone.id ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Input
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="+5491123456789"
                      aria-label="Teléfono editado"
                      aria-invalid={Boolean(editPhoneError)}
                    />
                    {editPhoneError && (
                      <p role="alert" className="text-sm text-destructive">
                        {editPhoneError}
                      </p>
                    )}
                  </div>
                  <Input
                    className="flex-1"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    placeholder="Etiqueta (opcional)"
                    aria-label="Etiqueta editada"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleUpdate(phone.id)}
                      disabled={updatePhone.isPending}
                    >
                      Guardar
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingId(null)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg glass-subtle px-3 py-1.5">
                  <span className="min-w-0 flex-1 truncate font-mono text-sm" title={phone.phone}>
                    {phone.phone}
                  </span>
                  {phone.label && (
                    <span className="min-w-0 truncate text-sm text-muted-foreground" title={phone.label}>
                      {phone.label}
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Editar teléfono de respaldo"
                    onClick={() => startEdit(phone)}
                  >
                    <PencilLineIcon className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Eliminar teléfono de respaldo"
                    onClick={() => handleDelete(phone)}
                    disabled={deletePhone.isPending}
                  >
                    <Trash2Icon className="size-3.5 text-destructive" />
                  </Button>
                </div>
              )}

              {deleteErrors[phone.id] && (
                <p role="alert" className="text-xs text-destructive">
                  {deleteErrors[phone.id]}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1 border-t border-foreground/8 pt-3">
        <p className="text-xs font-medium text-muted-foreground">Agregar respaldo</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Input
              value={addPhone}
              onChange={(e) => {
                setAddPhone(e.target.value);
                if (addPhoneError) setAddPhoneError("");
              }}
              placeholder="+5491123456789"
              aria-label="Teléfono de respaldo nuevo"
              aria-invalid={Boolean(addPhoneError)}
            />
            {addPhoneError && (
              <p role="alert" className="text-xs text-destructive">
                {addPhoneError}
              </p>
            )}
          </div>
          <Input
            className="flex-1"
            value={addLabel}
            onChange={(e) => setAddLabel(e.target.value)}
            placeholder="Etiqueta (opcional)"
            aria-label="Etiqueta del nuevo respaldo"
          />
          <Button
            type="button"
            size="sm"
            disabled={!addPhone || createPhone.isPending}
            onClick={handleAdd}
          >
            Agregar
          </Button>
        </div>
      </div>
    </div>
  );
};
