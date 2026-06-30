'use client';

import * as React from 'react';
import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox';
import { CheckIcon, ChevronDownIcon, SearchIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

// Searchable single-select built on base-ui Combobox using the "input inside
// popup" pattern: the trigger shows the selected value, and the popup holds a
// search field that filters the list. Styling mirrors the Select component.

const Combobox = ComboboxPrimitive.Root;
const ComboboxValue = ComboboxPrimitive.Value;

function ComboboxTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.Trigger>) {
  return (
    <ComboboxPrimitive.Trigger
      data-slot="combobox-trigger"
      className={cn(
        'flex h-8 items-center justify-between gap-1.5 rounded-lg glass-subtle py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-all duration-200 outline-none select-none hover:border-primary/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50 data-placeholder:text-muted-foreground',
        className,
      )}
      {...props}
    >
      <span className="line-clamp-1 flex-1 text-left">{children}</span>
      <ChevronDownIcon className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
    </ComboboxPrimitive.Trigger>
  );
}

function ComboboxContent({
  className,
  children,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.Popup> & {
  sideOffset?: number;
}) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner sideOffset={sideOffset} className="isolate z-50">
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          className={cn(
            'relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-56 origin-(--transform-origin) overflow-hidden rounded-xl glass-strong text-popover-foreground duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
            className,
          )}
          {...props}
        >
          {children}
        </ComboboxPrimitive.Popup>
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  );
}

function ComboboxInput({
  className,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.Input>) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-2.5">
      <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
      <ComboboxPrimitive.Input
        data-slot="combobox-input"
        className={cn(
          'flex h-9 w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground',
          className,
        )}
        {...props}
      />
    </div>
  );
}

function ComboboxEmpty({
  className,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.Empty>) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      // base-ui keeps Empty mounted as an aria-live region and only fills it when
      // the list is empty; collapse its padding while empty so it adds no strip.
      className={cn(
        'px-2 py-4 text-center text-sm text-muted-foreground empty:p-0',
        className,
      )}
      {...props}
    />
  );
}

function ComboboxList({
  className,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.List>) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn('max-h-72 overflow-x-hidden overflow-y-auto p-1', className)}
      {...props}
    />
  );
}

function ComboboxItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.Item>) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        'relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1.5 pr-8 pl-1.5 text-sm outline-hidden select-none transition-colors duration-100 hover:bg-primary/10 hover:text-foreground data-[highlighted]:bg-primary/10 data-[highlighted]:text-foreground data-disabled:pointer-events-none data-disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <span className="flex-1 truncate">{children}</span>
      <ComboboxPrimitive.ItemIndicator className="absolute right-2 flex size-4 items-center justify-center">
        <CheckIcon className="size-4" />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  );
}

export {
  Combobox,
  ComboboxValue,
  ComboboxTrigger,
  ComboboxContent,
  ComboboxInput,
  ComboboxEmpty,
  ComboboxList,
  ComboboxItem,
};
