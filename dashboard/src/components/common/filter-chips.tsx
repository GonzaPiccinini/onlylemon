import { XIcon, XCircleIcon } from "lucide-react";

export interface FilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

interface FilterChipsProps {
  chips: FilterChip[];
  onClearAll?: () => void;
}

export const FilterChips = ({ chips, onClearAll }: FilterChipsProps) => {
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 animate-in fade-in slide-in-from-bottom-1 duration-200">
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="glass-subtle flex items-center gap-1 rounded-full py-1 pr-1 pl-3 text-xs"
        >
          {chip.label}
          {/* Full-size, fully-clickable remove hit area with hover feedback. */}
          <button
            type="button"
            onClick={chip.onRemove}
            aria-label={`Eliminar filtro: ${chip.label}`}
            className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
          >
            <XIcon className="size-3.5" />
          </button>
        </span>
      ))}
      {chips.length > 1 && onClearAll && (
        // A real, obvious button — bordered solid pill, destructive on hover.
        <button
          type="button"
          onClick={onClearAll}
          className="flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
        >
          <XCircleIcon className="size-3.5" />
          Limpiar todo
        </button>
      )}
    </div>
  );
};
