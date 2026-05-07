import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { LeadStatusTimeline } from '@/components/common/lead-status-timeline';
import { Badge } from '@/components/ui/badge';
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
import { useCashierLeads } from '@/features/cashier/cashier-hooks';
import { leadStatusLabel } from '@/lib/lead-status';
import { PaginationControls } from '@/components/common/pagination-controls';

const STATUS_OPTIONS: Array<{ label: string; value: 'CONTACTED' | 'CONVERTED' }> = [
  { label: 'Contactado', value: 'CONTACTED' },
  { label: 'Convertido', value: 'CONVERTED' },
];

export const CashierHistoryPage = () => {
  const [statuses, setStatuses] = useState<Array<'CONTACTED' | 'CONVERTED'>>([]);
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const filters = useMemo(
    () => ({
      statuses: statuses.length > 0 ? statuses : undefined,
      code: code.trim() || undefined,
      phone: phone.trim() || undefined,
    }),
    [statuses, code, phone],
  );

  const { data: leads = [], isLoading } = useCashierLeads(filters);
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
            Visualiza estado, telefono y fechas clave.
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          <div className='grid gap-3 md:grid-cols-3'>
            <div className='flex flex-col gap-2'>
              <FieldLabel htmlFor='cashier-leads-statuses'>
                Filtrar por estado
              </FieldLabel>
              <MultiSelect
                id='cashier-leads-statuses'
                options={STATUS_OPTIONS.map((o) => ({
                  value: o.value,
                  label: o.label,
                }))}
                value={statuses}
                onChange={(next) => {
                  setStatuses(next as Array<'CONTACTED' | 'CONVERTED'>);
                  setPage(1);
                }}
                placeholder='Todos los estados'
              />
            </div>

            <div className='flex flex-col gap-2'>
              <FieldLabel>Filtrar por codigo</FieldLabel>
              <Input
                value={code}
                placeholder='Ej. ABC123'
                onChange={(event) => {
                  setCode(event.target.value);
                  setPage(1);
                }}
              />
            </div>

            <div className='flex flex-col gap-2'>
              <FieldLabel>Filtrar por telefono</FieldLabel>
              <Input
                value={phone}
                placeholder='Ej. 54911...'
                onChange={(event) => {
                  setPhone(event.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Codigo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Telefono</TableHead>
                <TableHead>Historico</TableHead>
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
                      <LeadStatusTimeline timeline={lead.statusTimeline} />
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
