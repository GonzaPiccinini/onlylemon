/**
 * SessionAliasEditor.tsx — Inline editor to assign/clear a session's alias.
 *
 * Used in the WhatsApp sessions management section (cashier session page and
 * admin sessions panel). Mirrors the MaxSessionsEditor inline-edit pattern:
 * a pencil button toggles an input with Enter-to-save / Escape-to-cancel.
 *
 * Persists via useSetSessionAlias (PATCH .../alias), which also refreshes the
 * session list so the new name shows everywhere (incl. the chat selector).
 */

import { useState } from 'react';
import { CheckIcon, PencilIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSetSessionAlias } from '../hooks/useSetSessionAlias';
import type { ChatScope } from '@/api/chat.service';

interface SessionAliasEditorProps {
  scope: ChatScope;
  sessionId: string;
  alias: string | null | undefined;
}

export const SessionAliasEditor = ({
  scope,
  sessionId,
  alias,
}: SessionAliasEditorProps) => {
  const setAlias = useSetSessionAlias(scope);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(alias ?? '');

  const handleOpen = () => {
    setValue(alias ?? '');
    setEditing(true);
  };

  const handleCancel = () => setEditing(false);

  const handleSave = () => {
    const trimmed = value.trim();
    setAlias.mutate(
      { sessionId, alias: trimmed ? trimmed : null },
      { onSuccess: () => setEditing(false) },
    );
  };

  if (!editing) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={handleOpen}
        className="h-7 max-w-[12rem] gap-1.5 px-2 text-xs"
        title="Editar alias"
      >
        <PencilIcon className="size-3 shrink-0" />
        <span className="truncate">{alias?.trim() ? alias : 'Poner alias'}</span>
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value.slice(0, 60))}
        placeholder="Alias"
        maxLength={60}
        className="h-7 w-40 text-xs"
        autoFocus
        disabled={setAlias.isPending}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave();
          if (e.key === 'Escape') handleCancel();
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0"
        onClick={handleSave}
        disabled={setAlias.isPending}
        title="Guardar"
        aria-label="Guardar"
      >
        <CheckIcon className="size-3.5" />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0"
        onClick={handleCancel}
        disabled={setAlias.isPending}
        title="Cancelar"
        aria-label="Cancelar"
      >
        <XIcon className="size-3.5" />
      </Button>
    </div>
  );
};
