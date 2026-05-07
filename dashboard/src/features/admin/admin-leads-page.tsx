import { Fragment, useMemo, useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import {
  useAdminCashiers,
  useAdminLeadHistory,
  useAdminLeads,
} from '@/features/admin/admin-hooks';
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
import { MultiSelect } from '@/components/ui/multi-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { LeadStatus } from '@/types/domain';
import {
  buildFullStatusTimeline,
  leadDisplayStatus,
  leadDisplayStatusLabel,
  leadStatusLabel,
  type FullTimelineEntry,
  type LeadDisplayStatus,
} from '@/lib/lead-status';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { PaginationControls } from '@/components/common/pagination-controls';

const STATUS_OPTIONS: Array<{ label: string; value: LeadStatus }> = [
  { label: 'No contactado', value: 'NOT_CONTACTED' },
  { label: 'Contactado', value: 'CONTACTED' },
  { label: 'Convertido', value: 'CONVERTED' },
];

const COLUMN_COUNT = 7;

const renderDisplayStatusBadge = (status: LeadDisplayStatus) => {
  if (status === 'RECARGA') {
    return (
      <Badge
        variant='outline'
        className='border-primary! text-primary'
      >
        {leadDisplayStatusLabel(status)}
      </Badge>
    );
  }
  return (
    <Badge
      variant={
        status === 'CONVERTED'
          ? 'default'
          : status === 'CONTACTED'
            ? 'secondary'
            : 'outline'
      }
    >
      {leadStatusLabel(status)}
    </Badge>
  );
};

const renderTimelineEntryBadge = (entry: FullTimelineEntry) => {
  if (entry.status === 'RECARGA') {
    return (
      <Badge
        variant='outline'
        className='shrink-0 border-primary! text-primary'
      >
        {leadDisplayStatusLabel(entry.status)}
      </Badge>
    );
  }
  return (
    <Badge
      variant={
        entry.status === 'CONVERTED'
          ? 'default'
          : entry.status === 'CONTACTED'
            ? 'secondary'
            : 'outline'
      }
      className='shrink-0'
    >
      {leadStatusLabel(entry.status)}
    </Badge>
  );
};

const FullTimeline = ({ leadId }: { leadId: string }) => {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const {
    data,
    isLoading,
    isError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useAdminLeadHistory(leadId, {
    enabled: true,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const firstPage = data?.pages[0];
  const allConversions = useMemo(
    () => data?.pages.flatMap((p) => p.conversions) ?? [],
    [data],
  );
  const entries = useMemo(
    () =>
      firstPage
        ? buildFullStatusTimeline({
            createdAt: firstPage.createdAt,
            contactedAt: firstPage.contactedAt,
            conversions: allConversions,
            firstConversionAt: firstPage.firstConversionAt,
          })
        : [],
    [firstPage, allConversions],
  );

  const isFilterActive = Boolean(dateFrom || dateTo);

  if (isLoading) {
    return (
      <div className='py-2 text-xs text-muted-foreground'>
        Cargando histórico…
      </div>
    );
  }
  if (isError || !firstPage) {
    return (
      <div className='py-2 text-xs text-destructive'>
        No se pudo cargar el histórico.
      </div>
    );
  }

  const total = firstPage.total;
  const counterText = isFilterActive
    ? `${entries.length} eventos · ${allConversions.length} conversiones (de ${total} totales)`
    : `Histórico completo · ${entries.length} eventos · ${total} conversiones`;

  return (
    <div className='flex flex-col gap-1.5 py-2'>
      <div className='flex flex-wrap items-end gap-3 pb-1'>
        <div className='flex flex-col gap-1'>
          <FieldLabel>Desde</FieldLabel>
          <Input
            type='date'
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className='w-36 text-xs'
          />
        </div>
        <div className='flex flex-col gap-1'>
          <FieldLabel>Hasta</FieldLabel>
          <Input
            type='date'
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className='w-36 text-xs'
          />
        </div>
      </div>
      <span className='text-xs font-medium text-muted-foreground'>
        {counterText}
      </span>
      <div className='grid max-h-80 grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 overflow-y-auto pr-2'>
        {entries.map((entry, index) => (
          <Fragment key={`${entry.status}-${entry.at}-${index}`}>
            {renderTimelineEntryBadge(entry)}
            <time
              dateTime={entry.at}
              className='text-xs text-muted-foreground whitespace-nowrap'
            >
              {formatDateTime(entry.at)}
            </time>
          </Fragment>
        ))}
        {isFilterActive && allConversions.length === 0 && (
          <p className='col-span-2 py-1 text-xs text-muted-foreground'>
            No hay conversiones en este rango.
          </p>
        )}
      </div>
      {hasNextPage && (
        <Button
          variant='outline'
          size='sm'
          onClick={() => void fetchNextPage()}
          disabled={isFetchingNextPage}
          className='mt-1 self-start'
        >
          {isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
        </Button>
      )}
    </div>
  );
};

export const AdminLeadsPage = () => {
  const [statuses, setStatuses] = useState<LeadStatus[]>([]);
  const [cashierIds, setCashierIds] = useState<string[]>([]);
  const [adCode, setAdCode] = useState('');
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('');
  const [page, setPage] = useState(1);
  const [expandedLeads, setExpandedLeads] = useState<Set<string>>(new Set());
  const pageSize = 10;

  const { data: cashiers = [] } = useAdminCashiers();
  const cashierOptions = useMemo(
    () => cashiers.map((c) => ({ value: c.id, label: c.name })),
    [cashiers],
  );
  const filters = useMemo(
    () => ({
      statuses: statuses.length > 0 ? statuses : undefined,
      cashierIds: cashierIds.length > 0 ? cashierIds : undefined,
      adCode: adCode.trim() || undefined,
      code: code.trim() || undefined,
      phone: phone.trim() || undefined,
    }),
    [adCode, cashierIds, code, phone, statuses],
  );
  const { data: leads = [], isLoading } = useAdminLeads(filters);
  const totalPages = Math.max(1, Math.ceil(leads.length / pageSize));
  const normalizedPage = Math.min(page, totalPages);
  const start = (normalizedPage - 1) * pageSize;
  const paginatedLeads = leads.slice(start, start + pageSize);

  const toggleExpanded = (leadId: string) => {
    setExpandedLeads((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) {
        next.delete(leadId);
      } else {
        next.add(leadId);
      }
      return next;
    });
  };

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
              <FieldLabel htmlFor="admin-leads-statuses">
                Filtrar por estado
              </FieldLabel>
              <MultiSelect
                id="admin-leads-statuses"
                options={STATUS_OPTIONS.map((o) => ({
                  value: o.value,
                  label: o.label,
                }))}
                value={statuses}
                onChange={(next) => {
                  setStatuses(next as LeadStatus[]);
                  setPage(1);
                }}
                placeholder="Todos los estados"
              />
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
                placeholder="Ej. 54911..."
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
                <TableHead className='w-10' />
                <TableHead>Codigo</TableHead>
                <TableHead>Publicidad</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Cajero</TableHead>
                <TableHead>Telefono</TableHead>
                <TableHead>Última actualización</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={COLUMN_COUNT}>Cargando leads...</TableCell>
                </TableRow>
              ) : leads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={COLUMN_COUNT}>
                    No hay leads para el filtro seleccionado.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedLeads.map((lead) => {
                  const displayStatus = leadDisplayStatus(lead);
                  const isExpanded = expandedLeads.has(lead.id);
                  const lastUpdate = lead.lastStatusChangeAt ?? lead.activityAt;
                  return (
                    <Fragment key={lead.id}>
                      <TableRow
                        role='button'
                        tabIndex={0}
                        aria-expanded={isExpanded}
                        aria-label={
                          isExpanded
                            ? 'Ocultar histórico completo'
                            : 'Ver histórico completo'
                        }
                        onClick={() => toggleExpanded(lead.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            toggleExpanded(lead.id);
                          }
                        }}
                        className={cn(
                          'cursor-pointer',
                          isExpanded && 'border-b-0',
                        )}
                      >
                        <TableCell className='text-muted-foreground'>
                          {isExpanded ? (
                            <ChevronDownIcon className='size-4' />
                          ) : (
                            <ChevronRightIcon className='size-4' />
                          )}
                        </TableCell>
                        <TableCell>{lead.code}</TableCell>
                        <TableCell>{lead.adCode ?? '-'}</TableCell>
                        <TableCell>{renderDisplayStatusBadge(displayStatus)}</TableCell>
                        <TableCell>{lead.cashierName ?? 'Sin asignar'}</TableCell>
                        <TableCell>{lead.phone ?? '-'}</TableCell>
                        <TableCell>
                          {lastUpdate ? (
                            <time
                              dateTime={lastUpdate}
                              className='text-xs text-muted-foreground whitespace-nowrap'
                            >
                              {formatDateTime(lastUpdate)}
                            </time>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow className='bg-muted/30 hover:bg-muted/30'>
                          <TableCell />
                          <TableCell colSpan={COLUMN_COUNT - 1}>
                            <FullTimeline leadId={lead.id} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })
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
