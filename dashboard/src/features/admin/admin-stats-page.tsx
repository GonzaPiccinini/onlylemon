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
import { getDefaultDateRange } from "@/lib/date-range";
import { formatCurrency, formatHours, formatPercentage } from "@/lib/format";
import {
  useAdminSummary,
  useCashierStats,
  useFundsSeries,
} from "@/features/admin/admin-hooks";

export const AdminStatsPage = () => {
  const [dateRange, setDateRange] = useState(getDefaultDateRange());
  const { data: summary, isLoading: summaryLoading } = useAdminSummary(dateRange);
  const { data: cashierStats = [], isLoading: cashierStatsLoading } = useCashierStats(dateRange);
  const { data: fundsSeries = [], isLoading: seriesLoading } = useFundsSeries(dateRange);

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        title="Estadisticas operativas"
        description="Analiza rendimiento por cajero y actividad de cargas en periodos definidos."
      />

      <PeriodFilter value={dateRange} onChange={setDateRange} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {summaryLoading || !summary ? (
          Array.from({ length: 5 }).map((_, index) => <LoadingCard key={index} />)
        ) : (
          <>
            <MetricCard label="Monto cargado" value={formatCurrency(summary.totalAddedFunds)} />
            <MetricCard label="Cargas realizadas" value={String(summary.totalOperations)} />
            <MetricCard label="Horas activas" value={formatHours(summary.totalActiveHours)} />
            <MetricCard label="Clientes desde ads" value={String(summary.adsClients)} />
            <MetricCard
              label="% clientes desde ads"
              value={formatPercentage(summary.adsClientsPercentage)}
            />
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Evolucion de cargas</CardTitle>
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
                <Bar dataKey="totalAmount" fill="var(--chart-1)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Comparativa por cajero</CardTitle>
          <CardDescription>
            Horas activas, cargas y clientes desde publicidad por cajero.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cajero</TableHead>
                <TableHead>Cargas</TableHead>
                <TableHead>Monto</TableHead>
                <TableHead>Horas</TableHead>
                <TableHead>Clientes ads</TableHead>
                <TableHead>% ads</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cashierStatsLoading ? (
                <TableRow>
                  <TableCell colSpan={6}>Cargando estadisticas...</TableCell>
                </TableRow>
              ) : cashierStats.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6}>No hay datos para el periodo seleccionado.</TableCell>
                </TableRow>
              ) : (
                cashierStats.map((cashier) => (
                  <TableRow key={cashier.cashierId}>
                    <TableCell>{cashier.cashierName}</TableCell>
                    <TableCell>{cashier.operationsCount}</TableCell>
                    <TableCell>{formatCurrency(cashier.addedFundsTotal)}</TableCell>
                    <TableCell>{formatHours(cashier.activeHours)}</TableCell>
                    <TableCell>{cashier.adsClients}</TableCell>
                    <TableCell>{formatPercentage(cashier.adsClientsPercentage)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </section>
  );
};
