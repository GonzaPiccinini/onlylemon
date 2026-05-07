import { useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { PaginationControls } from '@/components/common/pagination-controls';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCashierConversions } from '@/features/cashier/cashier-hooks';
import { formatCurrency, formatDateTime } from '@/lib/format';

const PAGE_SIZE = 25;

export const CashierConversionsPage = () => {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useCashierConversions({ page, pageSize: PAGE_SIZE });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
