"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      {/* border-separate + tight vertical spacing turns each row into a
          detached, floating glass card (see TableCell). */}
      <table
        data-slot="table"
        className={cn(
          "w-full caption-bottom border-separate border-spacing-x-0 border-spacing-y-1.5 text-sm tabular-nums",
          className
        )}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={cn(className)} {...props} />
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={cn(className)} {...props} />
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "[&>tr>td]:bg-card/60 [&>tr>td]:border-y [&>tr>td]:border-primary/20 font-medium",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "[&>td]:transition-colors",
        // The first column reads as the row's title — gentle emphasis.
        "[&>td:first-child]:font-medium [&>td:first-child]:text-foreground",
        // Elegant, gentle hover — the card just lifts a touch (no glow, no bar).
        "hover:[&>td]:bg-card/65",
        // Selected gets a soft lemon wash — the only lemon in the table body.
        "data-[state=selected]:[&>td]:bg-primary/[0.1]",
        "has-[[aria-expanded=true]]:[&>td]:bg-card/55",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-8 px-4 text-left align-middle text-xs font-semibold whitespace-nowrap text-muted-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        // A refined floating card per row: a calm frosted surface, soft
        // rounding, a whisper of top-edge light. No borders.
        "bg-card/40 px-4 py-3.5 align-middle whitespace-nowrap backdrop-blur-sm",
        "shadow-[inset_0_1px_0_0_rgb(255_255_255_/_0.05)]",
        "first:rounded-l-xl last:rounded-r-xl",
        "[&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
