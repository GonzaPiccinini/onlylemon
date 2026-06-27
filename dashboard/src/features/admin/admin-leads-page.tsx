import { Fragment, useMemo, useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon, FilterIcon, HashIcon, MegaphoneIcon, PhoneIcon, TagIcon, UsersIcon } from 'lucide-react';
import { FilterChips } from '@/components/common/filter-chips';
import { PageHeader } from '@/components/common/page-header';
import { TableRowsSkeleton } from '@/components/common/table-skeleton';
import {
  useAdminCashiers,
  useAdminLeadHistory,
  useAdminLeads,
} from '@/features/admin/admin-hooks';
import { StatusBadge } from '@/components/common/status-badge';
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
import type { LeadFilterStatus } from '@/types/domain';
import {
  buildFullStatusTimeline,
  leadDisplayStatus,
  leadDisplayStatusLabel,
  leadStatusBadge,
  type FullTimelineEntry,
  type LeadDisplayStatus,
} from '@/lib/lead-status';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { PaginationControls } from '@/components/common/pagination-controls';

const STATUS_OPTIONS: Array<{ label: string; value: LeadFilterStatus }> = [
  { label: 'No contactado', value: 'NOT_CONTACTED' },
  { label: 'Contactado', value: 'CONTACTED' },
  { label: 'Convertido', value: 'CONVERTED' },
  { label: 'Recarga', value: 'RECARGA' },
];

const COLUMN_COUNT = 7;

const renderDisplayStatusBadge = (status: LeadDisplayStatus) => {
  const { variant, icon, className } = leadStatusBadge(status);
  return (
    <StatusBadge variant={variant} icon={icon} className={className}>
      {leadDisplayStatusLabel(status)}
    </StatusBadge>
  );
};

const renderTimelineEntryBadge = (entry: FullTimelineEntry) => {
  const { variant, icon, className } = leadStatusBadge(entry.status);
  return (
    <StatusBadge
      variant={variant}
      icon={icon}
      className={cn('shrink-0', className)}
    >
      {leadDisplayStatusLabel(entry.status)}
    </StatusBadge>
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
  const [statuses, setStatuses] = useState<LeadFilterStatus[]>([]);
  const [cashierIds, setCashierIds] = useState<string[]>([]);
  const [adCode, setAdCode] = useState('');
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('');
  const [page, setPage] = useState(1);
  const [expandedLeads, setExpandedLeads] = useState<Set<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const pageSize = 15;

  const activeFiltersCount =
    (statuses.length > 0 ? 1 : 0) +
    (cashierIds.length > 0 ? 1 : 0) +
    (adCode.trim() ? 1 : 0) +
    (code.trim() ? 1 : 0) +
    (phone.trim() ? 1 : 0);

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
      page,
      pageSize,
    }),
    [adCode, cashierIds, code, page, pageSize, phone, statuses],
  );
  const { data, isLoading } = useAdminLeads(filters);
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // After the data has settled (e.g. the 15s refetch shrank `total` below the
  // current page), clamp `page` down so the query stops requesting an
  // out-of-range page and stranding the user on an empty table. Adjusting state
  // during render (rather than in an effect) lets React re-render immediately
  // without an extra commit. Guarded on `data` so it never fights an in-flight
  // page change while data is briefly undefined.
  if (data && page > totalPages) {
    setPage(totalPages);
  }
  const normalizedPage = Math.min(page, totalPages);

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
          <div>
            <button
              type="button"
              onClick={() => setFiltersOpen((prev) => !prev)}
              aria-expanded={filtersOpen}
              className="flex items-center gap-2 glass-subtle rounded-xl px-3 py-2 text-sm font-medium transition-all hover:border-primary/40"
            >
              <FilterIcon className="size-4 text-muted-foreground" />
              <span>Filtros</span>
              {activeFiltersCount > 0 && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full accent-gradient text-[10px] font-bold text-white">
                  {activeFiltersCount}
                </span>
              )}
            </button>
          </div>
          {filtersOpen && (
            <div className="glass rounded-2xl p-4 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <TagIcon className="size-3.5" />
                    </span>
                    <span className="text-xs font-semibold text-foreground/80">Estado</span>
                  </div>
                  <MultiSelect
                    id="admin-leads-statuses"
                    options={STATUS_OPTIONS.map((o) => ({
                      value: o.value,
                      label: o.label,
                    }))}
                    value={statuses}
                    onChange={(next) => {
                      setStatuses(next as LeadFilterStatus[]);
                      setPage(1);
                    }}
                    placeholder="Todos los estados"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <UsersIcon className="size-3.5" />
                    </span>
                    <span className="text-xs font-semibold text-foreground/80">Cajero</span>
                  </div>
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

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <MegaphoneIcon className="size-3.5" />
                    </span>
                    <span className="text-xs font-semibold text-foreground/80">Publicidad</span>
                  </div>
                  <Input
                    value={adCode}
                    placeholder="Ej. utm_content"
                    onChange={(event) => {
                      setAdCode(event.target.value);
                      setPage(1);
                    }}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <HashIcon className="size-3.5" />
                    </span>
                    <span className="text-xs font-semibold text-foreground/80">Código</span>
                  </div>
                  <Input
                    value={code}
                    placeholder="Ej. ABC123"
                    onChange={(event) => {
                      setCode(event.target.value);
                      setPage(1);
                    }}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <PhoneIcon className="size-3.5" />
                    </span>
                    <span className="text-xs font-semibold text-foreground/80">Teléfono</span>
                  </div>
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
            </div>
          )}

          <FilterChips
            chips={[
              ...statuses.map((s) => {
                const opt = STATUS_OPTIONS.find((o) => o.value === s);
                return { key: `status-${s}`, label: `Estado: ${opt?.label ?? s}`, onRemove: () => { setStatuses((prev) => prev.filter((x) => x !== s)); setPage(1); } };
              }),
              ...cashierIds.map((id) => {
                const opt = cashierOptions.find((o) => o.value === id);
                return { key: `cashier-${id}`, label: `Cajero: ${opt?.label ?? id}`, onRemove: () => { setCashierIds((prev) => prev.filter((x) => x !== id)); setPage(1); } };
              }),
              ...(adCode.trim() ? [{ key: 'adCode', label: `Publicidad: ${adCode}`, onRemove: () => { setAdCode(''); setPage(1); } }] : []),
              ...(code.trim() ? [{ key: 'code', label: `Código: ${code}`, onRemove: () => { setCode(''); setPage(1); } }] : []),
              ...(phone.trim() ? [{ key: 'phone', label: `Teléfono: ${phone}`, onRemove: () => { setPhone(''); setPage(1); } }] : []),
            ]}
            onClearAll={() => { setStatuses([]); setCashierIds([]); setAdCode(''); setCode(''); setPhone(''); setPage(1); }}
          />

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
                <TableRowsSkeleton rows={5} cols={COLUMN_COUNT} />
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={COLUMN_COUNT}>
                    No hay leads para el filtro seleccionado.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((lead) => {
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
            onPageChange={(p) => setPage(p)}
          />
        </CardContent>
      </Card>
    </section>
  );
};
