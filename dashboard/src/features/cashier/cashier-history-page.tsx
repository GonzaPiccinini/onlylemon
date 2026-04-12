import { useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency } from '@/lib/format';
import { useCashierLeads } from '@/features/cashier/cashier-hooks';
import type { LeadStatus } from '@/types/domain';
import { leadStatusLabel } from '@/lib/lead-status';
import { PaginationControls } from '@/components/common/pagination-controls';

const STATUS_OPTIONS: Array<{ label: string; value: LeadStatus | 'ALL' }> = [
  { label: 'Todos', value: 'ALL' },
  { label: 'Contactado', value: 'CONTACTED' },
  { label: 'Convertido', value: 'CONVERTED' },
  { label: 'Expirado', value: 'EXPIRED' },
];

export const CashierHistoryPage = () => {
  const [status, setStatus] = useState<LeadStatus | 'ALL'>('ALL');
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const filterStatus = status === 'ALL' ? undefined : status;
  const { data: leads = [], isLoading } = useCashierLeads(filterStatus);
  const totalPages = Math.max(1, Math.ceil(leads.length / pageSize));
  const normalizedPage = Math.min(page, totalPages);
  const start = (normalizedPage - 1) * pageSize;
  const paginatedLeads = leads.slice(start, start + pageSize);

  return (
    <section className='flex flex-col gap-4'>
      <PageHeader
        title='Leads del cajero'
        description='Tabla de leads con filtros por estado.'
      />

      <Card>
        <CardHeader>
          <CardTitle>Leads registrados</CardTitle>
          <CardDescription>
            Visualiza estado, telefono, valor y fechas clave.
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          <div className='max-w-xs'>
            <div className='flex flex-col gap-2'>
              <FieldLabel>Filtrar por estado</FieldLabel>
              <Select
                value={status}
                onValueChange={(value) => {
                  setStatus(value as LeadStatus | 'ALL');
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Filtrar por estado' />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {STATUS_OPTIONS.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        label={option.label}
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Codigo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Telefono</TableHead>
                <TableHead>Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4}>Cargando leads...</TableCell>
                </TableRow>
              ) : leads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4}>
                    No hay leads para el filtro seleccionado.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedLeads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell>{lead.code}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          lead.status === 'CONVERTED' ? 'default' : 'outline'
                        }
                      >
                        {leadStatusLabel(lead.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>{lead.phone ?? '-'}</TableCell>
                    <TableCell>
                      {lead.amount === null ? '-' : formatCurrency(lead.amount)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <PaginationControls
            page={normalizedPage}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>
    </section>
  );
};
