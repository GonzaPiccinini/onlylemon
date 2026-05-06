import { useEffect, useMemo, useState } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency, formatDateTime } from '@/lib/format';
import type { Lead, LeadStatus } from '@/types/domain';
import { leadStatusLabel } from '@/lib/lead-status';
import { PaginationControls } from '@/components/common/pagination-controls';

const STATUS_OPTIONS: Array<{ label: string; value: LeadStatus }> = [
  { label: 'No contactado', value: 'NOT_CONTACTED' },
  { label: 'Contactado', value: 'CONTACTED' },
  { label: 'Convertido', value: 'CONVERTED' },
  { label: 'Expirado', value: 'EXPIRED' },
];

const preserveExpiredLeadOrder = (previousLeads: Lead[], nextLeads: Lead[]) => {
  if (previousLeads.length === 0 || nextLeads.length === 0) {
    return nextLeads;
  }

  const previousLeadStatuses = new Map(
    previousLeads.map((lead) => [lead.id, lead.status]),
  );
  const previousIndexById = new Map(
    previousLeads.map((lead, index) => [lead.id, index]),
  );
  const leadsById = new Map(nextLeads.map((lead) => [lead.id, lead]));
  const nextOrder = nextLeads.map((lead) => lead.id);
  const transitionedToExpired = nextLeads
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
};

export const AdminLeadsPage = () => {
  const [statuses, setStatuses] = useState<LeadStatus[]>([]);
  const [cashierIds, setCashierIds] = useState<string[]>([]);
  const [adCode, setAdCode] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const { data: cashiers = [] } = useAdminCashiers();
  const [orderedLeads, setOrderedLeads] = useState<Lead[]>([]);
  const toggleStatus = (status: LeadStatus) => {
    setStatuses((current) =>
      current.includes(status)
        ? current.filter((item) => item !== status)
        : [...current, status],
    );
    setPage(1);
  };

  const toggleCashier = (cashierId: string) => {
    setCashierIds((current) =>
      current.includes(cashierId)
        ? current.filter((item) => item !== cashierId)
        : [...current, cashierId],
    );
    setPage(1);
  };

  const filters = useMemo(
    () => ({
      status: statuses.length === 0 ? undefined : statuses,
      cashierId: cashierIds.length === 0 ? undefined : cashierIds,
      adCode: adCode.trim() || undefined,
    }),
    [adCode, cashierIds, statuses],
  );
  const { data: leads = [], isLoading } = useAdminLeads(filters);
  useEffect(() => {
    // The displayed order intentionally depends on the previous rendered list so
    // leads that transition to EXPIRED can keep their visual position.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrderedLeads((previousLeads) =>
      preserveExpiredLeadOrder(previousLeads, leads),
    );
  }, [leads]);

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
              <div className="rounded-lg border p-3">
                <button
                  type="button"
                  className="mb-2 text-xs text-muted-foreground underline"
                  onClick={() => {
                    setStatuses([]);
                    setPage(1);
                  }}
                >
                  {statuses.length === 0 ? 'Todos los estados' : 'Limpiar selección'}
                </button>
                <div className="flex flex-col gap-2">
                  {STATUS_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={statuses.includes(option.value)}
                        onCheckedChange={() => toggleStatus(option.value)}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <FieldLabel>Filtrar por cajero</FieldLabel>
              <div className="rounded-lg border p-3">
                <button
                  type="button"
                  className="mb-2 text-xs text-muted-foreground underline"
                  onClick={() => {
                    setCashierIds([]);
                    setPage(1);
                  }}
                >
                  {cashierIds.length === 0 ? 'Todos los cajeros' : 'Limpiar selección'}
                </button>
                <div className="flex max-h-40 flex-col gap-2 overflow-y-auto">
                  {cashiers.map((cashier) => (
                    <label
                      key={cashier.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={cashierIds.includes(cashier.id)}
                        onCheckedChange={() => toggleCashier(cashier.id)}
                      />
                      <span className="truncate">{cashier.name}</span>
                    </label>
                  ))}
                </div>
              </div>
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
