import { useState } from 'react';
import { CheckIcon, PencilIcon, XIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface InlineRenameProps {
  /** Current value — null/undefined renders the placeholder in muted colour. */
  value: string | null | undefined;
  /** Shown when value is empty; also used as aria-label fallback. */
  placeholder: string;
  /** Called on save with the trimmed string. May return a Promise. */
  onSave: (value: string) => Promise<void> | void;
  maxLength?: number;
  /** Set true while an external mutation is in flight to disable controls. */
  isPending?: boolean;
  /** Overrides the default aria-label on the trigger button. */
  ariaLabel?: string;
  className?: string;
}

/**
 * Generalised inline-edit: displays text with a hover pencil affordance.
 * Clicking opens a glass-subtle Input with check/cancel; Enter saves, Escape cancels.
 * Designed to replace SessionAliasEditor across multiple screens.
 */
export const InlineRename = ({
  value,
  placeholder,
  onSave,
  maxLength = 60,
  isPending = false,
  ariaLabel,
  className,
}: InlineRenameProps) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const handleOpen = () => {
    setDraft(value ?? '');
    setEditing(true);
  };

  const handleCancel = () => setEditing(false);

  const handleSave = async () => {
    try {
      await onSave(draft.trim());
      setEditing(false);
    } catch {
      // Stay in edit mode on failure — parent can show error feedback.
    }
  };

  if (editing) {
    return (
      <div className={cn('flex items-center gap-1', className)}>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, maxLength))}
          placeholder={placeholder}
          maxLength={maxLength}
          className="h-7 min-w-0 text-xs"
          autoFocus
          disabled={isPending}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleSave();
            if (e.key === 'Escape') handleCancel();
          }}
        />
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={() => void handleSave()}
          disabled={isPending}
          aria-label="Guardar"
        >
          <CheckIcon />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={handleCancel}
          disabled={isPending}
          aria-label="Cancelar"
        >
          <XIcon />
        </Button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleOpen}
      aria-label={
        ariaLabel ??
        (value?.trim() ? `Renombrar: ${value}` : placeholder)
      }
      className={cn(
        'group/inline-rename -mx-1 flex items-center gap-1 rounded-md px-1 py-0.5',
        'text-left text-sm transition-colors duration-200',
        'hover:bg-muted/40',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        !value?.trim() && 'text-muted-foreground',
        className,
      )}
    >
      <span className="truncate">
        {value?.trim() ? value : placeholder}
      </span>
      <PencilIcon
        className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-200 group-hover/inline-rename:opacity-100"
        aria-hidden="true"
      />
    </button>
  );
};
