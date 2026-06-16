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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
import { formatHours, formatPercentage } from "@/lib/format";
import { useMoneyFormatter } from "@/lib/use-currency";
import {
  useAdminSummary,
  useCashierStats,
  useFundsSeries,
} from "@/features/admin/admin-hooks";

type StatsView = "total" | "contacted" | "gross" | "first";

export const AdminStatsPage = () => {
  const money = useMoneyFormatter();
  const [dateRange, setDateRange] = useState(getDefaultDateRange());
  const [view, setView] = useState<StatsView>("total");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const { data: summary, isLoading: summaryLoading } = useAdminSummary(dateRange);
  const { data: cashierStats = [], isLoading: cashierStatsLoading } = useCashierStats(dateRange);
  const { data: fundsSeries, isLoading: seriesLoading } = useFundsSeries(dateRange);
  // "total" charts overall gross income; each category view charts its own series.
  const chartData =
    view === "contacted"
      ? (fundsSeries?.incomeByContactedDate ?? [])
      : view === "first"
      ? (fundsSeries?.firstChargesByDate ?? [])
      : (fundsSeries?.grossByConversionDate ?? []);
  // In a category view, chartData IS that category's series, so derive its cards from it.
  const categoryTotals = chartData.reduce(
    (acc, point) => ({ count: acc.count + point.count, sum: acc.sum + point.sum }),
    { count: 0, sum: 0 },
  );
  const categoryAverage =
    categoryTotals.count > 0 ? categoryTotals.sum / categoryTotals.count : 0;
  const categoryCountLabel =
    view === "contacted"
      ? "Conversiones (por contacto)"
      : view === "first"
      ? "Primeras cargas"
      : "Conversiones";
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

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">Vista:</span>
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(nextValue) => setView(nextValue as StatsView)}
        >
          <ToggleGroupItem value="total">Totales</ToggleGroupItem>
          <ToggleGroupItem value="contacted">Por contacto</ToggleGroupItem>
          <ToggleGroupItem value="gross">Bruto por conversion</ToggleGroupItem>
          <ToggleGroupItem value="first">Primeras cargas</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div
        className={
          view === "total"
            ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
            : "grid gap-3 sm:grid-cols-3"
        }
      >
        {view === "total" ? (
          summaryLoading || !summary ? (
            Array.from({ length: 5 }).map((_, index) => <LoadingCard key={index} />)
          ) : (
            <>
              <MetricCard label="Leads totales" value={String(summary.totalLeads)} />
              <MetricCard label="Leads convertidos" value={String(summary.convertedLeads)} />
              <MetricCard label="Tasa conversion" value={formatPercentage(summary.conversionRate)} />
              <MetricCard label="Valor convertido" value={money.format(summary.totalConvertedValue)} />
              <MetricCard label="Horas activas" value={formatHours(summary.totalActiveHours)} />
            </>
          )
        ) : seriesLoading || !fundsSeries ? (
          Array.from({ length: 3 }).map((_, index) => <LoadingCard key={index} />)
        ) : (
          <>
            <MetricCard label={categoryCountLabel} value={String(categoryTotals.count)} />
            <MetricCard label="Monto total" value={money.format(categoryTotals.sum)} />
            <MetricCard label="Monto promedio" value={money.format(categoryAverage)} />
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Evolucion de ingresos</CardTitle>
          <CardDescription>
            {view === "contacted"
              ? "Ingreso por dia segun fecha de contacto del lead."
              : view === "first"
              ? "Primeras cargas por dia (primera conversion historica de cada lead)."
              : "Ingreso bruto por dia segun fecha de conversion."}
          </CardDescription>
        </CardHeader>
        <CardContent className="h-[300px]">
          {seriesLoading ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              Cargando grafico...
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, left: 8, right: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="4 4" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip formatter={(value) => money.format(Number(value))} />
                <Bar dataKey="sum" fill="var(--chart-1)" radius={[8, 8, 0, 0]} />
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
                <TableHead>Tasa conversion</TableHead>
                <TableHead>Valor convertido</TableHead>
                <TableHead>Horas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cashierStatsLoading ? (
                <TableRow>
                  <TableCell colSpan={7}>Cargando estadisticas...</TableCell>
                </TableRow>
              ) : cashierStats.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>No hay datos para el periodo seleccionado.</TableCell>
                </TableRow>
              ) : (
                paginatedStats.map((cashier) => (
                  <TableRow key={cashier.cashierId}>
                    <TableCell>{cashier.cashierName}</TableCell>
                    <TableCell>{cashier.totalLeads}</TableCell>
                    <TableCell>{cashier.contactedLeads}</TableCell>
                    <TableCell>{cashier.convertedLeads}</TableCell>
                    <TableCell>{formatPercentage(cashier.conversionRate)}</TableCell>
                    <TableCell>{money.format(cashier.convertedValue)}</TableCell>
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
