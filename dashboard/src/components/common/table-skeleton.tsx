import { TableCell, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

interface TableRowsSkeletonProps {
  /** Number of placeholder rows to render. */
  rows?: number;
  /** Number of columns — must match the table's column count. */
  cols: number;
}

/**
 * Loading placeholder for tables — renders `rows` skeleton rows with one
 * shimmer bar per column, so the table keeps its shape while data loads.
 * Drop it inside <TableBody> in place of a "Cargando..." row.
 */
export const TableRowsSkeleton = ({ rows = 5, cols }: TableRowsSkeletonProps) => (
  <>
    {Array.from({ length: rows }).map((_, r) => (
      <TableRow key={r}>
        {Array.from({ length: cols }).map((_, c) => (
          <TableCell key={c}>
            <Skeleton className="h-4 w-full max-w-[140px]" />
          </TableCell>
        ))}
      </TableRow>
    ))}
  </>
);
