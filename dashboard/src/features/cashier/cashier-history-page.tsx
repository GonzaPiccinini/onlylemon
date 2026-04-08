import { PageHeader } from '@/components/common/page-header';
import { Badge } from '@/components/ui/badge';
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
import { formatCurrency, formatDateTime } from '@/lib/format';
import { useAddFundsHistory } from '@/features/cashier/cashier-hooks';

export const CashierHistoryPage = () => {
  const { data: operations = [], isLoading } = useAddFundsHistory();

  return (
    <section className='flex flex-col gap-4'>
      <PageHeader
        title='Historial de cargas'
        description='Consulta todas las cargas de saldo registradas por vos.'
      />

      <Card>
        <CardHeader>
          <CardTitle>Operaciones registradas</CardTitle>
          <CardDescription>
            Incluye usuario, monto y origen publicitario.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Telefono</TableHead>
                <TableHead>Monto</TableHead>
                <TableHead>Desde ads</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5}>Cargando operaciones...</TableCell>
                </TableRow>
              ) : operations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5}>No hay cargas registradas.</TableCell>
                </TableRow>
              ) : (
                operations.map((operation) => (
                  <TableRow key={operation.id}>
                    <TableCell>{formatDateTime(operation.createdAt)}</TableCell>
                    <TableCell>{operation.userName}</TableCell>
                    <TableCell>{operation.phoneNumber}</TableCell>
                    <TableCell>{formatCurrency(operation.amount)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={operation.fromAds ? 'default' : 'outline'}
                      >
                        {operation.fromAds ? 'Si' : 'No'}
                      </Badge>
                    </TableCell>
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
