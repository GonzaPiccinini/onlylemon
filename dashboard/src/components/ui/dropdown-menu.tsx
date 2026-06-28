'use client';

import { Menu as MenuPrimitive } from '@base-ui/react/menu';

import { cn } from '@/lib/utils';

const DropdownMenu = MenuPrimitive.Root;

function DropdownMenuTrigger({ ...props }: MenuPrimitive.Trigger.Props) {
  return (
    <MenuPrimitive.Trigger
      data-slot="dropdown-menu-trigger"
      {...props}
    />
  );
}

function DropdownMenuContent({
  className,
  children,
  align = 'end',
  sideOffset = 4,
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<MenuPrimitive.Positioner.Props, 'align' | 'sideOffset'>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        align={align}
        sideOffset={sideOffset}
        className="z-50"
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className={cn(
            'min-w-[10rem] glass-strong rounded-xl p-1 text-sm text-popover-foreground outline-none',
            'data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95',
            'data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
            className,
          )}
          {...props}
        >
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

function DropdownMenuItem({
  className,
  variant = 'default',
  ...props
}: MenuPrimitive.Item.Props & {
  variant?: 'default' | 'destructive';
}) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 outline-none transition-colors',
        variant === 'default' &&
          'hover:bg-accent hover:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground',
        variant === 'destructive' &&
          'text-destructive hover:bg-destructive/10 hover:text-destructive data-highlighted:bg-destructive/10 data-highlighted:text-destructive',
        className,
      )}
      {...props}
    />
  );
}

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem };
