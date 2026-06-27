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
import { FilterChips } from "@/components/common/filter-chips";
import { TableRowsSkeleton } from "@/components/common/table-skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
import { formatDuration, formatPercentage } from "@/lib/format";
import { useMoneyFormatter } from "@/lib/use-currency";
import {
  useAdminSummary,
  useCashierStats,
  useFundsSeries,
} from "@/features/admin/admin-hooks";

type StatsView = "total" | "contacted" | "gross" | "first";

// Compact axis labels (e.g. "1.2M", "350K") so wide currency values never clip.
const compactNumber = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});

type ChartTooltipProps = {
  active?: boolean;
  payload?: Array<{ value?: number | string }>;
  label?: string | number;
  formatValue?: (n: number) => string;
};

// Glass tooltip card — legible on the dark theme (replaces recharts' white box).
const ChartTooltip = ({ active, payload, label, formatValue }: ChartTooltipProps) => {
  if (!active || !payload || payload.length === 0) return null;
  const value = Number(payload[0]?.value ?? 0);
  return (
    <div className="glass-strong rounded-lg px-3 py-2 shadow-lg">
      <p className="mb-0.5 text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground">
        {formatValue ? formatValue(value) : value}
      </p>
    </div>
  );
};

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

      <FilterChips
        chips={[
          ...(dateRange.from !== getDefaultDateRange().from
            ? [{ key: 'from', label: `Desde: ${dateRange.from}`, onRemove: () => { setDateRange({ ...dateRange, from: getDefaultDateRange().from }); setPage(1); } }]
            : []),
          ...(dateRange.to !== getDefaultDateRange().to
            ? [{ key: 'to', label: `Hasta: ${dateRange.to}`, onRemove: () => { setDateRange({ ...dateRange, to: getDefaultDateRange().to }); setPage(1); } }]
            : []),
          ...(view !== 'total'
            ? [{ key: 'view', label: `Vista: ${view === 'contacted' ? 'Por contacto' : view === 'gross' ? 'Bruto' : 'Primeras cargas'}`, onRemove: () => setView('total') }]
            : []),
        ]}
        onClearAll={() => { setDateRange(getDefaultDateRange()); setView('total'); setPage(1); }}
      />

      <div className="glass rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Vista</span>
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
              <MetricCard label="Tiempo activo" value={formatDuration(summary.totalActiveHours * 60)} />
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
            <Skeleton className="h-full w-full rounded-md" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, left: 8, right: 8, bottom: 8 }}>
                <defs>
                  {/* Frosted bar fill — violet→blue vertical gradient, translucent
                      at the base so bars read like glass over the canvas. */}
                  <linearGradient id="barGlass" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent-violet)" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.45} />
                  </linearGradient>
                </defs>
                {/* Clean, futuristic grid: faint solid horizontal lines only —
                    no dashes, no vertical clutter. */}
                <CartesianGrid
                  vertical={false}
                  stroke="rgba(180, 195, 255, 0.1)"
                  strokeWidth={1}
                />
                <XAxis dataKey="date" />
                <YAxis
                  width={76}
                  tickFormatter={(value) => compactNumber.format(Number(value))}
                />
                <Tooltip
                  cursor={{ fill: "rgba(180, 195, 255, 0.06)" }}
                  content={<ChartTooltip formatValue={(n) => money.format(n)} />}
                />
                <Bar
                  dataKey="sum"
                  fill="url(#barGlass)"
                  radius={[8, 8, 0, 0]}
                  stroke="var(--accent-violet)"
                  strokeOpacity={0.35}
                  isAnimationActive
                  animationDuration={900}
                  animationEasing="ease-out"
                />
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
                <TableHead>Tiempo activo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cashierStatsLoading ? (
                <TableRowsSkeleton rows={5} cols={7} />
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
                    <TableCell>{formatDuration(cashier.activeHours * 60)}</TableCell>
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
