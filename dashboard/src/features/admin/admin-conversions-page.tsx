import { useMemo, useState } from 'react';
import { BanknoteIcon, CalendarIcon, FilterIcon, HashIcon, MegaphoneIcon, PhoneIcon, UsersIcon } from 'lucide-react';
import { FilterChips } from '@/components/common/filter-chips';
import { PageHeader } from '@/components/common/page-header';
import { PaginationControls } from '@/components/common/pagination-controls';
import { useAdminConversions, useAdminCashiers, useAdminConversionsTotals } from '@/features/admin/admin-hooks';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import { formatDateTime } from '@/lib/format';
import { useMoneyFormatter } from '@/lib/use-currency';

const PAGE_SIZE = 15;

export const AdminConversionsPage = () => {
  const money = useMoneyFormatter();
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Filters state
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [adCode, setAdCode] = useState('');
  const [cashierIds, setCashierIds] = useState<string[]>([]);
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');

  const activeFiltersCount =
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0) +
    (phone.trim() ? 1 : 0) +
    (code.trim() ? 1 : 0) +
    (adCode.trim() ? 1 : 0) +
    (cashierIds.length > 0 ? 1 : 0) +
    (amountMin !== '' ? 1 : 0) +
    (amountMax !== '' ? 1 : 0);

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
      adCode: adCode.trim() || undefined,
      cashierIds: cashierIds.length > 0 ? cashierIds : undefined,
      amountMin: amountMin !== '' ? Number(amountMin) : undefined,
      amountMax: amountMax !== '' ? Number(amountMax) : undefined,
    }),
    [page, dateFrom, dateTo, phone, code, adCode, cashierIds, amountMin, amountMax],
  );

  const totalsFilters = useMemo(
    () => ({
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      phone: phone.trim() || undefined,
      code: code.trim() || undefined,
      adCode: adCode.trim() || undefined,
      cashierIds: cashierIds.length > 0 ? cashierIds : undefined,
      amountMin: amountMin !== '' ? Number(amountMin) : undefined,
      amountMax: amountMax !== '' ? Number(amountMax) : undefined,
    }),
    [dateFrom, dateTo, phone, code, adCode, cashierIds, amountMin, amountMax],
  );

  const { data: totals, isLoading: totalsLoading } = useAdminConversionsTotals(totalsFilters);

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
          <div>
            <button
              type="button"
              onClick={() => setFiltersOpen((prev) => !prev)}
              aria-expanded={filtersOpen}
              className="flex items-center gap-2 glass-subtle rounded-xl px-3 py-2 text-sm font-medium transition-all hover:border-primary/40"
            >
              <FilterIcon className="size-4 text-muted-foreground" />
              <span>Filtros</span>
              {activeFiltersCount > 0 && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full accent-gradient text-[10px] font-bold text-white">
                  {activeFiltersCount}
                </span>
              )}
            </button>
          </div>
          {/* Filter bar */}
          {filtersOpen && (
            <div className="glass rounded-2xl p-4 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <CalendarIcon className="size-3.5" />
                    </span>
                    <span className="text-xs font-semibold text-foreground/80">Desde</span>
                  </div>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={handleFilterChange(setDateFrom)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <CalendarIcon className="size-3.5" />
                    </span>
                    <span className="text-xs font-semibold text-foreground/80">Hasta</span>
                  </div>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={handleFilterChange(setDateTo)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <UsersIcon className="size-3.5" />
                    </span>
                    <span className="text-xs font-semibold text-foreground/80">Cajero</span>
                  </div>
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
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <HashIcon className="size-3.5" />
                    </span>
                    <span className="text-xs font-semibold text-foreground/80">Código</span>
                  </div>
                  <Input
                    value={code}
                    placeholder="Ej. ABC123"
                    onChange={handleFilterChange(setCode)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <MegaphoneIcon className="size-3.5" />
                    </span>
                    <span className="text-xs font-semibold text-foreground/80">Publicidad</span>
                  </div>
                  <Input
                    value={adCode}
                    placeholder="Ej. utm_content"
                    onChange={handleFilterChange(setAdCode)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <PhoneIcon className="size-3.5" />
                    </span>
                    <span className="text-xs font-semibold text-foreground/80">Teléfono</span>
                  </div>
                  <Input
                    value={phone}
                    placeholder="Ej. 54911..."
                    onChange={handleFilterChange(setPhone)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <BanknoteIcon className="size-3.5" />
                    </span>
                    <span className="text-xs font-semibold text-foreground/80">Monto mín.</span>
                  </div>
                  <Input
                    type="number"
                    value={amountMin}
                    min={0}
                    placeholder="Ej. 3000"
                    onChange={handleFilterChange(setAmountMin)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <BanknoteIcon className="size-3.5" />
                    </span>
                    <span className="text-xs font-semibold text-foreground/80">Monto máx.</span>
                  </div>
                  <Input
                    type="number"
                    value={amountMax}
                    min={0}
                    placeholder="Ej. 50000"
                    onChange={handleFilterChange(setAmountMax)}
                  />
                </div>
              </div>
            </div>
          )}

          <FilterChips
            chips={[
              ...(dateFrom ? [{ key: 'dateFrom', label: `Desde: ${dateFrom}`, onRemove: () => { setDateFrom(''); setPage(1); } }] : []),
              ...(dateTo ? [{ key: 'dateTo', label: `Hasta: ${dateTo}`, onRemove: () => { setDateTo(''); setPage(1); } }] : []),
              ...cashierIds.map((id) => {
                const opt = cashierOptions.find((o) => o.value === id);
                return { key: `cashier-${id}`, label: `Cajero: ${opt?.label ?? id}`, onRemove: () => { setCashierIds((prev) => prev.filter((x) => x !== id)); setPage(1); } };
              }),
              ...(code.trim() ? [{ key: 'code', label: `Código: ${code}`, onRemove: () => { setCode(''); setPage(1); } }] : []),
              ...(adCode.trim() ? [{ key: 'adCode', label: `Publicidad: ${adCode}`, onRemove: () => { setAdCode(''); setPage(1); } }] : []),
              ...(phone.trim() ? [{ key: 'phone', label: `Teléfono: ${phone}`, onRemove: () => { setPhone(''); setPage(1); } }] : []),
              ...(amountMin !== '' ? [{ key: 'amountMin', label: `Mínimo: ${amountMin}`, onRemove: () => { setAmountMin(''); setPage(1); } }] : []),
              ...(amountMax !== '' ? [{ key: 'amountMax', label: `Máximo: ${amountMax}`, onRemove: () => { setAmountMax(''); setPage(1); } }] : []),
            ]}
            onClearAll={() => { setDateFrom(''); setDateTo(''); setPhone(''); setCode(''); setAdCode(''); setCashierIds([]); setAmountMin(''); setAmountMax(''); setPage(1); }}
          />

          <div className="grid gap-3 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-1">
                <CardDescription>Monto total</CardDescription>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {totalsLoading ? '…' : money.format(totals?.totalAmount ?? 0)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardDescription>Cantidad</CardDescription>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {totalsLoading ? '…' : String(totals?.count ?? 0)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardDescription>Monto promedio</CardDescription>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {totalsLoading ? '…' : money.format(totals?.averageAmount ?? 0)}
              </CardContent>
            </Card>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Codigo</TableHead>
                <TableHead>Publicidad</TableHead>
                <TableHead>Cajero</TableHead>
                <TableHead>Telefono</TableHead>
                <TableHead>Monto</TableHead>
                <TableHead>Fecha de conversion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6}>Cargando conversiones...</TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    No hay conversiones para los filtros seleccionados.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((conversion) => (
                  <TableRow key={conversion.id}>
                    <TableCell>{conversion.code}</TableCell>
                    <TableCell>{conversion.adCode ?? '-'}</TableCell>
                    <TableCell>{conversion.cashierName ?? '-'}</TableCell>
                    <TableCell>{conversion.phone ?? '-'}</TableCell>
                    <TableCell>
                      {money.format(Number(conversion.amount))}
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
