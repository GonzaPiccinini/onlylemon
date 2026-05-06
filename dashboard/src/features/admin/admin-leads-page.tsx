import { useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency, formatDateTime } from '@/lib/format';
import type { LeadStatus } from '@/types/domain';
import { leadStatusLabel } from '@/lib/lead-status';
import { PaginationControls } from '@/components/common/pagination-controls';

const STATUS_OPTIONS: Array<{ label: string; value: LeadStatus | 'ALL' }> = [
  { label: 'Todos', value: 'ALL' },
  { label: 'No contactado', value: 'NOT_CONTACTED' },
  { label: 'Contactado', value: 'CONTACTED' },
  { label: 'Convertido', value: 'CONVERTED' },
  { label: 'Expirado', value: 'EXPIRED' },
];

export const AdminLeadsPage = () => {
  const [status, setStatus] = useState<LeadStatus | 'ALL'>('ALL');
  const [cashierId, setCashierId] = useState<string>('ALL');
  const [adCode, setAdCode] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const { data: cashiers = [] } = useAdminCashiers();
  const previousLeadStatusesRef = useRef<Map<string, LeadStatus>>(new Map());
  const previousLeadOrderRef = useRef<string[]>([]);
  const filters = useMemo(
    () => ({
      status: status === 'ALL' ? undefined : status,
      cashierId: cashierId === 'ALL' ? undefined : cashierId,
      adCode: adCode.trim() || undefined,
    }),
    [adCode, cashierId, status],
  );
  const { data: leads = [], isLoading } = useAdminLeads(filters);
  const orderedLeads = useMemo(() => {
    if (leads.length === 0) {
      return leads;
    }

    const previousLeadStatuses = previousLeadStatusesRef.current;
    const previousLeadOrder = previousLeadOrderRef.current;
    const previousIndexById = new Map(
      previousLeadOrder.map((leadId, index) => [leadId, index]),
    );

    const leadsById = new Map(leads.map((lead) => [lead.id, lead]));
    const nextOrder = leads.map((lead) => lead.id);
    const transitionedToExpired = leads
      .filter((lead) => {
        const previousStatus = previousLeadStatuses.get(lead.id);
        return previousStatus !== undefined
          && previousStatus !== 'EXPIRED'
          && lead.status === 'EXPIRED';
      })
      .sort((left, right) => {
        const leftIndex = previousIndexById.get(left.id) ?? Number.MAX_SAFE_INTEGER;
        const rightIndex = previousIndexById.get(right.id) ?? Number.MAX_SAFE_INTEGER;
        return leftIndex - rightIndex;
      });

    transitionedToExpired.forEach((lead) => {
      const previousIndex = previousIndexById.get(lead.id);
      if (previousIndex === undefined) {
        return;
      }

      const currentIndex = nextOrder.indexOf(lead.id);
      if (currentIndex === -1) {
        return;
      }

      nextOrder.splice(currentIndex, 1);
      const targetIndex = Math.min(previousIndex, nextOrder.length);
      nextOrder.splice(targetIndex, 0, lead.id);
    });

    return nextOrder
      .map((leadId) => leadsById.get(leadId))
      .filter((lead): lead is NonNullable<typeof lead> => lead !== undefined);
  }, [leads]);

  useEffect(() => {
    previousLeadStatusesRef.current = new Map(
      orderedLeads.map((lead) => [lead.id, lead.status]),
    );
    previousLeadOrderRef.current = orderedLeads.map((lead) => lead.id);
  }, [orderedLeads]);

  const totalPages = Math.max(1, Math.ceil(orderedLeads.length / pageSize));
  const normalizedPage = Math.min(page, totalPages);
  const start = (normalizedPage - 1) * pageSize;
  const paginatedLeads = orderedLeads.slice(start, start + pageSize);

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
              <FieldLabel>Filtrar por cajero</FieldLabel>
              <Select
                value={cashierId}
                onValueChange={(value) => {
                  setCashierId(value ?? 'ALL');
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Filtrar por cajero" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="ALL" label="Todos">
                      Todos
                    </SelectItem>
                    {cashiers.map((cashier) => (
                      <SelectItem
                        key={cashier.id}
                        value={cashier.id}
                        label={cashier.name}
                      >
                        {cashier.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
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
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Codigo</TableHead>
                <TableHead>Publicidad</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Cajero</TableHead>
                <TableHead>Telefono</TableHead>
                <TableHead>Monto</TableHead>
                <TableHead>Actividad</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7}>Cargando leads...</TableCell>
                </TableRow>
              ) : orderedLeads.length === 0 ? (
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
                      {lead.amount === null ? '-' : formatCurrency(lead.amount)}
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
