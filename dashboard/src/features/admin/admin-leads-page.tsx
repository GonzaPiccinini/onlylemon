import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { LeadStatusTimeline } from '@/components/common/lead-status-timeline';
import { useAdminCashiers, useAdminLeads } from '@/features/admin/admin-hooks';
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import type { LeadStatus } from '@/types/domain';
import { leadStatusLabel } from '@/lib/lead-status';
import { PaginationControls } from '@/components/common/pagination-controls';

const STATUS_OPTIONS: Array<{ label: string; value: LeadStatus | 'ALL' }> = [
  { label: 'Todos', value: 'ALL' },
  { label: 'No contactado', value: 'NOT_CONTACTED' },
  { label: 'Contactado', value: 'CONTACTED' },
  { label: 'Convertido', value: 'CONVERTED' },
];

export const AdminLeadsPage = () => {
  const [status, setStatus] = useState<LeadStatus | 'ALL'>('ALL');
  const [cashierIds, setCashierIds] = useState<string[]>([]);
  const [adCode, setAdCode] = useState('');
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const { data: cashiers = [] } = useAdminCashiers();
  const cashierOptions = useMemo(
    () => cashiers.map((c) => ({ value: c.id, label: c.name })),
    [cashiers],
  );
  const filters = useMemo(
    () => ({
      status: status === 'ALL' ? undefined : status,
      cashierIds: cashierIds.length > 0 ? cashierIds : undefined,
      adCode: adCode.trim() || undefined,
      code: code.trim() || undefined,
      phone: phone.trim() || undefined,
    }),
    [adCode, cashierIds, code, phone, status],
  );
  const { data: leads = [], isLoading } = useAdminLeads(filters);
  const totalPages = Math.max(1, Math.ceil(leads.length / pageSize));
  const normalizedPage = Math.min(page, totalPages);
  const start = (normalizedPage - 1) * pageSize;
  const paginatedLeads = leads.slice(start, start + pageSize);

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        title="Leads"
        description="Tabla global de leads con filtros por estado y cajero."
      />

      <Card>
        <CardHeader>
          <CardTitle>Leads del sistema</CardTitle>
          <CardDescription>
            Visualiza estados de conversion y asignacion por cajero.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="flex flex-col gap-2">
              <FieldLabel>Filtrar por estado</FieldLabel>
              <Select
                value={status}
                onValueChange={(value) => {
                  setStatus(value as LeadStatus | 'ALL');
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Filtrar por estado" />
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

            <div className="flex flex-col gap-2">
              <FieldLabel htmlFor="admin-leads-cashiers">
                Filtrar por cajero
              </FieldLabel>
              <MultiSelect
                id="admin-leads-cashiers"
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
              <FieldLabel>Filtrar por publicidad</FieldLabel>
              <Input
                value={adCode}
                placeholder="Ej. utm_content"
                onChange={(event) => {
                  setAdCode(event.target.value);
                  setPage(1);
                }}
              />
            </div>

            <div className="flex flex-col gap-2">
              <FieldLabel>Filtrar por codigo</FieldLabel>
              <Input
                value={code}
                placeholder="Ej. ABC123"
                onChange={(event) => {
                  setCode(event.target.value);
                  setPage(1);
                }}
              />
            </div>

            <div className="flex flex-col gap-2">
              <FieldLabel>Filtrar por telefono</FieldLabel>
              <Input
                value={phone}
                placeholder="Ej. +54911..."
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
                <TableHead>Publicidad</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Cajero</TableHead>
                <TableHead>Telefono</TableHead>
                <TableHead>Historico</TableHead>
                <TableHead>Actividad</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7}>Cargando leads...</TableCell>
                </TableRow>
              ) : leads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    No hay leads para el filtro seleccionado.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedLeads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell>{lead.code}</TableCell>
                    <TableCell>{lead.adCode ?? '-'}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          lead.status === 'CONVERTED' ? 'default' : 'outline'
                        }
                      >
                        {leadStatusLabel(lead.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>{lead.cashierName ?? 'Sin asignar'}</TableCell>
                    <TableCell>{lead.phone ?? '-'}</TableCell>
                    <TableCell>
                      <LeadStatusTimeline timeline={lead.statusTimeline} />
                    </TableCell>
                    <TableCell>{formatDateTime(lead.activityAt ?? lead.createdAt)}</TableCell>
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
