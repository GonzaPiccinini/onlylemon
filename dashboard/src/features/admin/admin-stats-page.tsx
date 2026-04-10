import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/common/page-header";
import { MetricCard } from "@/components/common/metric-card";
import { LoadingCard } from "@/components/common/loading-card";
import { PeriodFilter } from "@/components/common/period-filter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PaginationControls } from "@/components/common/pagination-controls";
import { getDefaultDateRange } from "@/lib/date-range";
import { formatCurrency, formatHours, formatPercentage } from "@/lib/format";
import {
  useAdminSummary,
  useCashierStats,
  useFundsSeries,
} from "@/features/admin/admin-hooks";

export const AdminStatsPage = () => {
  const [dateRange, setDateRange] = useState(getDefaultDateRange());
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const { data: summary, isLoading: summaryLoading } = useAdminSummary(dateRange);
  const { data: cashierStats = [], isLoading: cashierStatsLoading } = useCashierStats(dateRange);
  const { data: fundsSeries = [], isLoading: seriesLoading } = useFundsSeries(dateRange);
  const totalPages = Math.max(1, Math.ceil(cashierStats.length / pageSize));
  const normalizedPage = Math.min(page, totalPages);
  const start = (normalizedPage - 1) * pageSize;
  const paginatedStats = cashierStats.slice(start, start + pageSize);

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        title="Estadisticas de leads"
        description="Analiza conversiones por cajero y rendimiento por periodo."
      />

      <PeriodFilter
        value={dateRange}
        onChange={(nextRange) => {
          setDateRange(nextRange);
          setPage(1);
        }}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {summaryLoading || !summary ? (
          Array.from({ length: 5 }).map((_, index) => <LoadingCard key={index} />)
        ) : (
          <>
            <MetricCard label="Leads totales" value={String(summary.totalLeads)} />
            <MetricCard label="Leads convertidos" value={String(summary.convertedLeads)} />
            <MetricCard label="Tasa conversion" value={formatPercentage(summary.conversionRate)} />
            <MetricCard label="Valor convertido" value={formatCurrency(summary.totalConvertedValue)} />
            <MetricCard label="Horas activas" value={formatHours(summary.totalActiveHours)} />
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Evolucion de valor convertido</CardTitle>
          <CardDescription>Total acumulado por dia en el periodo.</CardDescription>
        </CardHeader>
        <CardContent className="h-[300px]">
          {seriesLoading ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              Cargando grafico...
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fundsSeries} margin={{ top: 20, left: 8, right: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="4 4" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Bar dataKey="totalValue" fill="var(--chart-1)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Comparativa por cajero</CardTitle>
          <CardDescription>
            Leads por estado, conversion y horas activas por cajero.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cajero</TableHead>
                <TableHead>Total leads</TableHead>
                <TableHead>Contactados</TableHead>
                <TableHead>Convertidos</TableHead>
                <TableHead>Expirados</TableHead>
                <TableHead>Tasa conversion</TableHead>
                <TableHead>Valor convertido</TableHead>
                <TableHead>Horas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cashierStatsLoading ? (
                <TableRow>
                  <TableCell colSpan={8}>Cargando estadisticas...</TableCell>
                </TableRow>
              ) : cashierStats.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8}>No hay datos para el periodo seleccionado.</TableCell>
                </TableRow>
              ) : (
                paginatedStats.map((cashier) => (
                  <TableRow key={cashier.cashierId}>
                    <TableCell>{cashier.cashierName}</TableCell>
                    <TableCell>{cashier.totalLeads}</TableCell>
                    <TableCell>{cashier.contactedLeads}</TableCell>
                    <TableCell>{cashier.convertedLeads}</TableCell>
                    <TableCell>{cashier.expiredLeads}</TableCell>
                    <TableCell>{formatPercentage(cashier.conversionRate)}</TableCell>
                    <TableCell>{formatCurrency(cashier.convertedValue)}</TableCell>
                    <TableCell>{formatHours(cashier.activeHours)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <div className="mt-3">
          <PaginationControls
            page={normalizedPage}
            totalPages={totalPages}
            onPageChange={setPage}
          />
          </div>
        </CardContent>
      </Card>
    </section>
  );
};
