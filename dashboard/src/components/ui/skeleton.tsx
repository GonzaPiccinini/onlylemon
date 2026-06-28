import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "relative overflow-hidden rounded-md bg-[color-mix(in_oklab,var(--foreground)_5%,transparent)] animate-pulse opacity-50",
        className
      )}
      {...props}
    >
      <span className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-[color-mix(in_oklab,var(--foreground)_10%,transparent)] to-transparent" />
    </div>
  )
}

export { Skeleton }
