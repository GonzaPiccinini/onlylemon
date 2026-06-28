import * as React from 'react';
import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { ChevronDownIcon, XIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

export interface MultiSelectOption {
  value: string;
  label: string;
}

export interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = 'Seleccionar...',
  emptyText = 'Sin opciones',
  className,
  disabled,
  id,
}: MultiSelectProps) {
  const selectedSet = React.useMemo(() => new Set(value), [value]);
  const triggerLabel = React.useMemo(() => {
    if (value.length === 0) return placeholder;
    if (value.length === 1) {
      const match = options.find((o) => o.value === value[0]);
      return match ? match.label : `1 seleccionado`;
    }
    return `${value.length} seleccionados`;
  }, [options, placeholder, value]);

  const toggle = React.useCallback(
    (optionValue: string, checked: boolean) => {
      if (checked) {
        if (selectedSet.has(optionValue)) return;
        onChange([...value, optionValue]);
      } else {
        if (!selectedSet.has(optionValue)) return;
        onChange(value.filter((v) => v !== optionValue));
      }
    },
    [onChange, selectedSet, value],
  );

  const clear = React.useCallback(() => onChange([]), [onChange]);

  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger
        id={id}
        disabled={disabled}
        render={
          <Button
            type="button"
            variant="outline"
            className={cn(
              'w-full justify-between gap-2 font-normal transition-all duration-200 hover:border-primary/50',
              value.length === 0 && 'text-muted-foreground',
              className,
            )}
          />
        }
      >
        <span className="line-clamp-1 text-left">{triggerLabel}</span>
        <ChevronDownIcon className="size-4 shrink-0 opacity-60" />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner sideOffset={4} className="z-50">
          <PopoverPrimitive.Popup
            className={cn(
              'min-w-[var(--anchor-width)] max-h-[min(60vh,20rem)] overflow-auto rounded-xl glass-strong p-1 text-sm text-popover-foreground outline-none',
              'data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95',
              'data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
            )}
          >
            {options.length === 0 ? (
              <div className="px-2 py-3 text-center text-muted-foreground">
                {emptyText}
              </div>
            ) : (
              <ul className="flex flex-col" role="listbox" aria-multiselectable>
                {options.map((option) => {
                  const checked = selectedSet.has(option.value);
                  return (
                    <li key={option.value} role="option" aria-selected={checked}>
                      <label
                        className={cn(
                          'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors duration-100',
                          'hover:bg-primary/10 hover:text-foreground',
                          checked && 'bg-primary/15',
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(next) =>
                            toggle(option.value, next === true)
                          }
                        />
                        <span className="line-clamp-1 flex-1">
                          {option.label}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            {value.length > 0 ? (
              <div className="mt-1 flex justify-end border-t pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clear}
                  className="h-7 gap-1.5 text-xs"
                >
                  <XIcon className="size-3" />
                  Limpiar
                </Button>
              </div>
            ) : null}
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
