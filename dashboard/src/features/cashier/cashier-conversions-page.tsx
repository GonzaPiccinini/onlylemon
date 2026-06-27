import { useMemo, useState } from 'react';
import { BanknoteIcon, CalendarIcon, FilterIcon, HashIcon, PhoneIcon } from 'lucide-react';
import { FilterChips } from '@/components/common/filter-chips';
import { PageHeader } from '@/components/common/page-header';
import { PaginationControls } from '@/components/common/pagination-controls';
import { TableRowsSkeleton } from '@/components/common/table-skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCashierConversions } from '@/features/cashier/cashier-hooks';
import { formatDateTime } from '@/lib/format';
import { useMoneyFormatter } from '@/lib/use-currency';

const PAGE_SIZE = 25;

export const CashierConversionsPage = () => {
  const money = useMoneyFormatter();
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Filter state
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');

  const activeFiltersCount =
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0) +
    (phone.trim() ? 1 : 0) +
    (code.trim() ? 1 : 0) +
    (amountMin !== '' ? 1 : 0) +
    (amountMax !== '' ? 1 : 0);

  const filters = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      phone: phone.trim() || undefined,
      code: code.trim() || undefined,
      amountMin: amountMin !== '' ? Number(amountMin) : undefined,
      amountMax: amountMax !== '' ? Number(amountMax) : undefined,
    }),
    [page, dateFrom, dateTo, phone, code, amountMin, amountMax],
  );

  const { data, isLoading } = useCashierConversions(filters);
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleFilterChange = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setter(e.target.value);
    setPage(1);
  };

  return (
    <section className='flex flex-col gap-4'>
      <PageHeader
        title='Conversiones'
        description='Historial de conversiones registradas por este cajero.'
      />

      <Card>
        <CardHeader>
          <CardTitle>Mis conversiones</CardTitle>
          <CardDescription>
            Conversiones ordenadas por fecha, mas recientes primero.
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          <div>
            <button
              type='button'
              onClick={() => setFiltersOpen((prev) => !prev)}
              aria-expanded={filtersOpen}
              className='flex items-center gap-2 glass-subtle rounded-xl px-3 py-2 text-sm font-medium transition-all hover:border-primary/40'
            >
              <FilterIcon className='size-4 text-muted-foreground' />
              <span>Filtros</span>
              {activeFiltersCount > 0 && (
                <span className='flex h-4 w-4 items-center justify-center rounded-full accent-gradient text-[10px] font-bold text-primary-foreground'>
                  {activeFiltersCount}
                </span>
              )}
            </button>
          </div>
          {/* Filter bar */}
          {filtersOpen && (
            <div className='glass rounded-2xl p-4 animate-in fade-in slide-in-from-top-2 duration-300'>
              <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
                <div className='flex flex-col gap-1.5'>
                  <div className='flex items-center gap-1.5'>
                    <span className='flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary'>
                      <CalendarIcon className='size-3.5' />
                    </span>
                    <span className='text-xs font-semibold text-foreground/80'>Desde</span>
                  </div>
                  <Input
                    type='date'
                    value={dateFrom}
                    onChange={handleFilterChange(setDateFrom)}
                  />
                </div>
                <div className='flex flex-col gap-1.5'>
                  <div className='flex items-center gap-1.5'>
                    <span className='flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary'>
                      <CalendarIcon className='size-3.5' />
                    </span>
                    <span className='text-xs font-semibold text-foreground/80'>Hasta</span>
                  </div>
                  <Input
                    type='date'
                    value={dateTo}
                    onChange={handleFilterChange(setDateTo)}
                  />
                </div>
                <div className='flex flex-col gap-1.5'>
                  <div className='flex items-center gap-1.5'>
                    <span className='flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary'>
                      <HashIcon className='size-3.5' />
                    </span>
                    <span className='text-xs font-semibold text-foreground/80'>Código</span>
                  </div>
                  <Input
                    value={code}
                    placeholder='Ej. ABC123'
                    onChange={handleFilterChange(setCode)}
                  />
                </div>
                <div className='flex flex-col gap-1.5'>
                  <div className='flex items-center gap-1.5'>
                    <span className='flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary'>
                      <PhoneIcon className='size-3.5' />
                    </span>
                    <span className='text-xs font-semibold text-foreground/80'>Teléfono</span>
                  </div>
                  <Input
                    value={phone}
                    placeholder='Ej. 54911...'
                    onChange={handleFilterChange(setPhone)}
                  />
                </div>
                <div className='flex flex-col gap-1.5'>
                  <div className='flex items-center gap-1.5'>
                    <span className='flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary'>
                      <BanknoteIcon className='size-3.5' />
                    </span>
                    <span className='text-xs font-semibold text-foreground/80'>Monto mín.</span>
                  </div>
                  <Input
                    type='number'
                    value={amountMin}
                    min={0}
                    placeholder='Ej. 3000'
                    onChange={handleFilterChange(setAmountMin)}
                  />
                </div>
                <div className='flex flex-col gap-1.5'>
                  <div className='flex items-center gap-1.5'>
                    <span className='flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary'>
                      <BanknoteIcon className='size-3.5' />
                    </span>
                    <span className='text-xs font-semibold text-foreground/80'>Monto máx.</span>
                  </div>
                  <Input
                    type='number'
                    value={amountMax}
                    min={0}
                    placeholder='Ej. 50000'
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
              ...(code.trim() ? [{ key: 'code', label: `Código: ${code}`, onRemove: () => { setCode(''); setPage(1); } }] : []),
              ...(phone.trim() ? [{ key: 'phone', label: `Teléfono: ${phone}`, onRemove: () => { setPhone(''); setPage(1); } }] : []),
              ...(amountMin !== '' ? [{ key: 'amountMin', label: `Mínimo: ${amountMin}`, onRemove: () => { setAmountMin(''); setPage(1); } }] : []),
              ...(amountMax !== '' ? [{ key: 'amountMax', label: `Máximo: ${amountMax}`, onRemove: () => { setAmountMax(''); setPage(1); } }] : []),
            ]}
            onClearAll={() => { setDateFrom(''); setDateTo(''); setPhone(''); setCode(''); setAmountMin(''); setAmountMax(''); setPage(1); }}
          />

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Codigo</TableHead>
                <TableHead>Telefono</TableHead>
                <TableHead>Monto</TableHead>
                <TableHead>Fecha de conversion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRowsSkeleton rows={5} cols={4} />
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4}>
                    No hay conversiones registradas.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((conversion) => (
                  <TableRow key={conversion.id}>
                    <TableCell>{conversion.code}</TableCell>
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
