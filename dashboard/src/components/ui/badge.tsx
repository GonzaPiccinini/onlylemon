/* eslint-disable react-refresh/only-export-components */
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default:
          "accent-gradient text-primary-foreground shadow-sm transition-colors duration-200 [a]:hover:opacity-90",
        secondary:
          "glass text-secondary-foreground transition-colors duration-200 hover:bg-secondary/60 [a]:hover:bg-secondary/50",
        destructive:
          "bg-destructive/15 text-destructive border-destructive/20 transition-colors duration-200 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/25",
        progress:
          "border-accent-violet/40 bg-accent-violet/22 text-accent-violet transition-colors duration-200 [a]:hover:bg-accent-violet/28",
        success:
          "border-success/40 bg-success/22 text-success transition-colors duration-200 [a]:hover:bg-success/28",
        converted:
          "border-primary/40 bg-primary/22 text-primary transition-colors duration-200 [a]:hover:bg-primary/28",
        neutral:
          "border-secondary-foreground/25 bg-secondary-foreground/12 text-secondary-foreground transition-colors duration-200 [a]:hover:bg-secondary-foreground/18",
        recharge:
          "border-recharge/40 bg-recharge/22 text-recharge transition-colors duration-200 [a]:hover:bg-recharge/28",
        outline:
          "glass text-foreground transition-colors duration-200 hover:bg-muted/50 [a]:hover:bg-muted/50 [a]:hover:text-muted-foreground",
        ghost:
          "hover:bg-muted/60 text-muted-foreground transition-colors duration-200 hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline transition-colors duration-200",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
