import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDownIcon, ChevronUpIcon, SmartphoneIcon } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/common/status-badge';
import { Checkbox } from '@/components/ui/checkbox';
import { DialogFooter } from '@/components/ui/dialog';
import {
  wahaStatusIcon,
  wahaStatusLabel,
  wahaStatusVariant,
} from '@/lib/waha-status';
import {
  adminKeys,
  useSessionLandings,
  useLandings,
} from '@/features/admin/admin-hooks';
import type { Cashier, WhatsappSession } from '@/types/domain';

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export interface AdminCashierLandingsPanelProps {
  cashier: Cashier;
}

export const AdminCashierLandingsPanel = ({ cashier }: AdminCashierLandingsPanelProps) => {
  const queryClient = useQueryClient();
  const { data: allLandings = [], isLoading: loadingLandings } = useLandings();

  const activeLandings = allLandings.filter((l) => l.status === 'ACTIVE');
  const allActiveLandingIds = activeLandings.map((l) => l.id);
  const allActiveLandingMap = new Map(activeLandings.map((l) => [l.id, l]));

  // Track which session groups are expanded
  const [openSet, setOpenSet] = useState<Set<string>>(new Set());

  // Per-session selected landing ids
  const [selectedByCashier, setSelectedByCashier] = useState<Map<string, Set<string>>>(new Map());

  // Track initial (server) state per session so we can diff on save
  const [initialByCashier, setInitialByCashier] = useState<Map<string, Set<string>>>(new Map());
  const [initializedSessions, setInitializedSessions] = useState<Set<string>>(new Set());

  const [isSaving, setIsSaving] = useState(false);

  const sessions = cashier.sessions;
  const workingCount = sessions.filter((s) => s.wahaStatus === 'WORKING').length;
  const totalCount = sessions.length;

  const totalSelected = Array.from(selectedByCashier.values()).reduce(
    (sum, set) => sum + set.size,
    0,
  );

  const toggleOpen = (sessionId: string) => {
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  };

  const getSelected = (sessionId: string): Set<string> =>
    selectedByCashier.get(sessionId) ?? new Set();

  const handleToggleLanding = (sessionId: string, landingId: string) => {
    setSelectedByCashier((prev) => {
      const next = new Map(prev);
      const current = new Set(next.get(sessionId) ?? []);
      if (current.has(landingId)) {
        current.delete(landingId);
      } else {
        current.add(landingId);
      }
      next.set(sessionId, current);
      return next;
    });
  };

  // Called by child when bound landings load — initialize selection once
  const initSession = (sessionId: string, boundIds: string[]) => {
    if (initializedSessions.has(sessionId)) return;
    setInitializedSessions((prev) => new Set([...prev, sessionId]));
    setInitialByCashier((prev) => {
      const next = new Map(prev);
      next.set(sessionId, new Set(boundIds));
      return next;
    });
    setSelectedByCashier((prev) => {
      if (prev.has(sessionId)) return prev;
      const next = new Map(prev);
      next.set(sessionId, new Set(boundIds));
      return next;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    const tasks: Promise<void>[] = [];

    for (const session of sessions) {
      const initial = initialByCashier.get(session.id) ?? new Set<string>();
      const current = selectedByCashier.get(session.id) ?? new Set<string>();

      // Check if there's a diff
      const hasChanged =
        initial.size !== current.size ||
        [...current].some((id) => !initial.has(id)) ||
        [...initial].some((id) => !current.has(id));

      if (!hasChanged) continue;

      const landingIds = Array.from(current);
      tasks.push(
        import('@/api/admin.service').then((m) =>
          m.adminService.replaceSessionLandings(session.id, { landingIds }),
        ).then(() => undefined),
      );
    }

    if (tasks.length === 0) {
      toast.success('Sin cambios que guardar');
      setIsSaving(false);
      return;
    }

    try {
      await Promise.all(tasks);
      // Update initial state to match saved state
      setInitialByCashier(new Map(selectedByCashier));
      // Invalidate per-session bound-landings cache so subsequent opens see
      // the new state (and also invalidate the landings list in case the
      // bindings affect any derived counts).
      await Promise.all([
        ...sessions.map((s) =>
          queryClient.invalidateQueries({
            queryKey: adminKeys.sessionLandings(s.id),
          }),
        ),
        queryClient.invalidateQueries({ queryKey: adminKeys.landings }),
      ]);
      toast.success('Bindings guardados');
    } catch {
      toast.error('No se pudieron guardar los bindings');
    } finally {
      setIsSaving(false);
    }
  };

  if (sessions.length === 0) {
    return (
      <div className='flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground'>
        <SmartphoneIcon className='size-8 opacity-40' />
        <p>Este cajero no tiene sesiones. Crea una primero.</p>
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-4'>
      {/* Summary line */}
      <p className='text-sm text-muted-foreground'>
        <span className='font-medium text-foreground'>{totalSelected}</span> bindings totales
        {' · '}
        <span className='font-medium text-foreground'>{workingCount}/{totalCount}</span> sesiones conectadas
      </p>

      {loadingLandings ? (
        <p className='text-sm text-muted-foreground'>Cargando landings...</p>
      ) : activeLandings.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          No hay landings activas. Crea una primero.
        </p>
      ) : (
        <div className='flex max-h-[380px] flex-col gap-1 overflow-y-auto'>
          {sessions.map((session) => {
            const isOpen = openSet.has(session.id);
            const isWorking = session.wahaStatus === 'WORKING';
            const title = session.whatsappPhoneNumber ?? 'Sin numero vinculado';

            return (
              <div key={session.id} className='rounded-lg border'>
                {/* Session header */}
                <button
                  type='button'
                  className={cn(
                    'flex w-full items-center gap-3 px-3 py-2 text-left',
                    !isWorking && 'opacity-60',
                  )}
                  onClick={() => {
                    toggleOpen(session.id);
                    // Lazy-init: pre-load selection when expanding
                  }}
                >
                  <div className='flex size-8 shrink-0 items-center justify-center rounded-full bg-muted'>
                    <SmartphoneIcon className='size-5 text-muted-foreground' />
                  </div>
                  <div className='min-w-0 flex-1'>
                    <p className='truncate text-sm font-medium'>{title}</p>
                  </div>
                  <StatusBadge
                    variant={wahaStatusVariant(session.wahaStatus)}
                    icon={wahaStatusIcon(session.wahaStatus)}
                    className='shrink-0 text-xs'
                  >
                    {wahaStatusLabel(session.wahaStatus)}
                  </StatusBadge>
                  {isOpen ? (
                    <ChevronUpIcon className='size-4 shrink-0 text-muted-foreground' />
                  ) : (
                    <ChevronDownIcon className='size-4 shrink-0 text-muted-foreground' />
                  )}
                </button>

                {/* Session body (lazy-loaded) */}
                {isOpen && (
                  <div className='border-t pb-2'>
                    <SessionLandingRowsConnected
                      session={session}
                      allActiveLandingIds={allActiveLandingIds}
                      allActiveLandingMap={allActiveLandingMap}
                      selected={getSelected(session.id)}
                      onToggle={(landingId) => handleToggleLanding(session.id, landingId)}
                      onInit={(boundIds) => initSession(session.id, boundIds)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <DialogFooter>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Guardando...' : 'Guardar'}
        </Button>
      </DialogFooter>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Connected session rows — fetches bound landings, calls onInit once
// ---------------------------------------------------------------------------

interface SessionLandingRowsConnectedProps {
  session: WhatsappSession;
  allActiveLandingIds: string[];
  allActiveLandingMap: Map<string, { id: string; url: string }>;
  selected: Set<string>;
  onToggle: (landingId: string) => void;
  onInit: (boundIds: string[]) => void;
}

const SessionLandingRowsConnected = ({
  session,
  allActiveLandingIds,
  allActiveLandingMap,
  selected,
  onToggle,
  onInit,
}: SessionLandingRowsConnectedProps) => {
  const { data: boundLandings, isLoading } = useSessionLandings(session.id);

  const [initialized, setInitialized] = useState(false);

  if (!isLoading && boundLandings && !initialized) {
    setInitialized(true);
    const boundIds = boundLandings.map((l) => l.id);
    onInit(boundIds);
  }

  if (isLoading) {
    return (
      <p className='pl-12 pt-2 pb-1 text-sm text-muted-foreground'>Cargando landings...</p>
    );
  }

  if (allActiveLandingIds.length === 0) {
    return (
      <p className='pl-12 pt-2 pb-1 text-sm text-muted-foreground'>
        No hay landings activas. Crea una primero.
      </p>
    );
  }

  return (
    <div className='flex flex-col gap-1.5 pl-12 pt-2 pb-1'>
      {allActiveLandingIds.map((landingId) => {
        const landing = allActiveLandingMap.get(landingId);
        if (!landing) return null;
        return (
          <label
            key={landingId}
            className='flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent/50 transition-colors'
          >
            <Checkbox
              checked={selected.has(landingId)}
              onCheckedChange={() => onToggle(landingId)}
            />
            <span className='truncate text-sm'>{landing.url}</span>
          </label>
        );
      })}
    </div>
  );
};
