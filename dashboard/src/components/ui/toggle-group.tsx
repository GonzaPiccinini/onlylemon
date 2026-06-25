import { createContext, useContext } from 'react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type ToggleGroupContextValue = {
  value: string;
  onValueChange: (value: string) => void;
};

const ToggleGroupContext = createContext<ToggleGroupContextValue | null>(null);

type ToggleGroupProps = {
  type?: 'single';
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  children: ReactNode;
};

export function ToggleGroup({
  value,
  onValueChange,
  className,
  children,
}: ToggleGroupProps) {
  return (
    <ToggleGroupContext.Provider value={{ value, onValueChange }}>
      <div role="group" className={cn('inline-flex flex-wrap items-center gap-1', className)}>
        {children}
      </div>
    </ToggleGroupContext.Provider>
  );
}

type ToggleGroupItemProps = ComponentPropsWithoutRef<'button'> & {
  value: string;
};

export function ToggleGroupItem({
  value,
  className,
  children,
  onClick,
  ...props
}: ToggleGroupItemProps) {
  const context = useContext(ToggleGroupContext);
  if (!context) {
    throw new Error('ToggleGroupItem must be used inside ToggleGroup');
  }

  const isActive = context.value === value;

  return (
    <button
      type="button"
      aria-pressed={isActive}
      data-active={isActive ? 'true' : undefined}
      className={cn(
        'inline-flex h-7 shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-transparent px-2.5 text-xs font-medium text-foreground/60 transition-all hover:text-foreground data-[active=true]:bg-background data-[active=true]:text-foreground data-[active=true]:shadow-sm dark:data-[active=true]:border-input dark:data-[active=true]:bg-input/30',
        className,
      )}
      onClick={(event) => {
        context.onValueChange(value);
        onClick?.(event);
      }}
      {...props}
    >
      {children}
    </button>
  );
}
