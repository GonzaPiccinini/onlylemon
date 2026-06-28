/* eslint-disable react-refresh/only-export-components */
import { cn } from '@/lib/utils'
import { cva, type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes } from 'react'

const iconBadgeVariants = cva(
  'inline-flex shrink-0 items-center justify-center bg-primary/10 text-primary',
  {
    variants: {
      size: {
        sm: 'size-6 rounded-md',
        md: 'size-8 rounded-lg',
      },
    },
    defaultVariants: {
      size: 'sm',
    },
  },
)

interface IconBadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof iconBadgeVariants> {}

function IconBadge({ size, className, ...props }: IconBadgeProps) {
  return (
    <span
      data-slot="icon-badge"
      className={cn(iconBadgeVariants({ size }), className)}
      {...props}
    />
  )
}

const accentIconBadgeVariants = cva(
  'inline-flex shrink-0 items-center justify-center accent-gradient text-primary-foreground',
  {
    variants: {
      size: {
        xs: 'size-4 rounded-full text-2xs font-bold',
        sm: 'size-7 rounded-lg glow-sm',
        md: 'size-8 rounded-lg',
        lg: 'size-9 rounded-xl glow-sm',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  },
)

interface AccentIconBadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof accentIconBadgeVariants> {}

function AccentIconBadge({ size, className, ...props }: AccentIconBadgeProps) {
  return (
    <span
      data-slot="accent-icon-badge"
      className={cn(accentIconBadgeVariants({ size }), className)}
      {...props}
    />
  )
}

export { IconBadge, iconBadgeVariants, AccentIconBadge, accentIconBadgeVariants }
