import { useMemo, useState } from 'react';
import { FilterIcon } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { PaginationControls } from '@/components/common/pagination-controls';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { FieldLabel } from '@/components/ui/field';
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
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => setFiltersOpen((prev) => !prev)}
              aria-expanded={filtersOpen}
            >
              <FilterIcon className='size-4' />
              Filtros
              {activeFiltersCount > 0 && (
                <Badge variant='secondary' className='ml-1'>
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>
          </div>
          {/* Filter bar */}
          {filtersOpen && (
          <div className='grid gap-3 md:grid-cols-3'>
            <div className='flex flex-col gap-2'>
              <FieldLabel>Fecha desde</FieldLabel>
              <Input
                type='date'
                value={dateFrom}
                onChange={handleFilterChange(setDateFrom)}
              />
            </div>
            <div className='flex flex-col gap-2'>
              <FieldLabel>Fecha hasta</FieldLabel>
              <Input
                type='date'
                value={dateTo}
                onChange={handleFilterChange(setDateTo)}
              />
            </div>
            <div className='flex flex-col gap-2'>
              <FieldLabel>Codigo</FieldLabel>
              <Input
                value={code}
                placeholder='Ej. ABC123'
                onChange={handleFilterChange(setCode)}
              />
            </div>
            <div className='flex flex-col gap-2'>
              <FieldLabel>Telefono</FieldLabel>
              <Input
                value={phone}
                placeholder='Ej. 54911...'
                onChange={handleFilterChange(setPhone)}
              />
            </div>
            <div className='flex flex-col gap-2'>
              <FieldLabel>Monto minimo</FieldLabel>
              <Input
                type='number'
                value={amountMin}
                min={0}
                placeholder='Ej. 3000'
                onChange={handleFilterChange(setAmountMin)}
              />
            </div>
            <div className='flex flex-col gap-2'>
              <FieldLabel>Monto maximo</FieldLabel>
              <Input
                type='number'
                value={amountMax}
                min={0}
                placeholder='Ej. 50000'
                onChange={handleFilterChange(setAmountMax)}
              />
            </div>
          </div>
          )}

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
                <TableRow>
                  <TableCell colSpan={4}>Cargando conversiones...</TableCell>
                </TableRow>
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
