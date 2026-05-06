import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { PaginationControls } from '@/components/common/pagination-controls';
import { useAdminConversions, useAdminCashiers } from '@/features/admin/admin-hooks';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MultiSelect } from '@/components/ui/multi-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency, formatDateTime } from '@/lib/format';

const PAGE_SIZE = 25;

export const AdminConversionsPage = () => {
  const [page, setPage] = useState(1);

  // Filters state
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [cashierIds, setCashierIds] = useState<string[]>([]);
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');

  const { data: cashiers = [] } = useAdminCashiers();
  const cashierOptions = useMemo(
    () => cashiers.map((c) => ({ value: c.id, label: c.name })),
    [cashiers],
  );

  const filters = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      phone: phone.trim() || undefined,
      code: code.trim() || undefined,
      cashierIds: cashierIds.length > 0 ? cashierIds : undefined,
      amountMin: amountMin !== '' ? Number(amountMin) : undefined,
      amountMax: amountMax !== '' ? Number(amountMax) : undefined,
    }),
    [page, dateFrom, dateTo, phone, code, cashierIds, amountMin, amountMax],
  );

  const { data, isLoading } = useAdminConversions(filters);
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleFilterChange = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setter(e.target.value);
    setPage(1);
  };

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        title="Conversiones"
        description="Historial global de conversiones con filtros por fecha, cajero, monto y mas."
      />

      <Card>
        <CardHeader>
          <CardTitle>Conversiones del sistema</CardTitle>
          <CardDescription>
            Conversiones ordenadas por fecha, mas recientes primero.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Filter bar */}
          <div className="grid gap-3 md:grid-cols-3">
            <div className="flex flex-col gap-2">
              <FieldLabel>Fecha desde</FieldLabel>
              <Input
                type="date"
                value={dateFrom}
                onChange={handleFilterChange(setDateFrom)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <FieldLabel>Fecha hasta</FieldLabel>
              <Input
                type="date"
                value={dateTo}
                onChange={handleFilterChange(setDateTo)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <FieldLabel htmlFor="admin-conversions-cashiers">
                Cajero
              </FieldLabel>
              <MultiSelect
                id="admin-conversions-cashiers"
                options={cashierOptions}
                value={cashierIds}
                onChange={(next) => {
                  setCashierIds(next);
                  setPage(1);
                }}
                placeholder="Todos los cajeros"
                emptyText="Sin cajeros disponibles"
              />
            </div>
            <div className="flex flex-col gap-2">
              <FieldLabel>Codigo</FieldLabel>
              <Input
                value={code}
                placeholder="Ej. ABC123"
                onChange={handleFilterChange(setCode)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <FieldLabel>Telefono</FieldLabel>
              <Input
                value={phone}
                placeholder="Ej. +54911..."
                onChange={handleFilterChange(setPhone)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <FieldLabel>Monto minimo</FieldLabel>
              <Input
                type="number"
                value={amountMin}
                min={0}
                placeholder="Ej. 3000"
                onChange={handleFilterChange(setAmountMin)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <FieldLabel>Monto maximo</FieldLabel>
              <Input
                type="number"
                value={amountMax}
                min={0}
                placeholder="Ej. 50000"
                onChange={handleFilterChange(setAmountMax)}
              />
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Codigo</TableHead>
                <TableHead>Cajero</TableHead>
                <TableHead>Telefono</TableHead>
                <TableHead>Monto</TableHead>
                <TableHead>Fecha de conversion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5}>Cargando conversiones...</TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5}>
                    No hay conversiones para los filtros seleccionados.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((conversion) => (
                  <TableRow key={conversion.id}>
                    <TableCell>{conversion.code}</TableCell>
                    <TableCell>{conversion.cashierName ?? '-'}</TableCell>
                    <TableCell>{conversion.phone ?? '-'}</TableCell>
                    <TableCell>
                      {formatCurrency(Number(conversion.amount))}
                    </TableCell>
                    <TableCell>{formatDateTime(conversion.createdAt)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <PaginationControls
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>
    </section>
  );
};
