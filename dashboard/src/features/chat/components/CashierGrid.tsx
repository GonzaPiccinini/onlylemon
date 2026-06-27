/**
 * CashierGrid.tsx — Admin landing picker: a search box pinned above a grid of
 * cashier cards (replaces the dropdown). Filtering is client-side — the cashier
 * list is already loaded in full, so in-memory matching is instant.
 *
 * UX:
 *   - Cards are ordered by relevance (on turn first, then more connected
 *     WhatsApps, then name) so the admin sees who's working at a glance.
 *   - Without a search, only the first VISIBLE_CAP are shown (no long scroll on
 *     landing); the rest are reachable via the search box.
 *   - Each card surfaces the count of connected WhatsApps and an "En turno" mark.
 */

import { useState } from 'react';
import { ChevronRightIcon, CircleDotIcon, SearchIcon, SmartphoneIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/common/status-badge';
import { cn } from '@/lib/utils';
import { ContactAvatar } from './contact-avatar';

// Combining diacritical marks (U+0300–U+036F); built from a string so the
// source stays plain ASCII (no invisible combining chars in the file).
const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g');

// How many cards to show on the landing (no search). Keeps the grid to a
// viewport-friendly slice so it doesn't scroll until the admin searches.
const VISIBLE_CAP = 12;

interface CashierGridItem {
  id: string;
  name: string;
  /** Count of WORKING WhatsApp sessions (live status from the worker). */
  workingSessionsCount?: number;
  /** True when the cashier has an open work shift ("en turno"). */
  hasActiveWorkSession?: boolean;
}

interface CashierGridProps {
  cashiers: CashierGridItem[];
  onSelect: (cashierId: string) => void;
  isLoading?: boolean;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

/** Lowercase + strip accents so "lucia" matches "Lucía". */
function normalize(value: string): string {
  return value.normalize('NFD').replace(DIACRITICS, '').toLowerCase();
}

/** Most relevant first: on turn, then more connected WhatsApps, then name. */
function byRelevance(a: CashierGridItem, b: CashierGridItem): number {
  const turn = Number(b.hasActiveWorkSession ?? false) - Number(a.hasActiveWorkSession ?? false);
  if (turn !== 0) return turn;
  const connected = (b.workingSessionsCount ?? 0) - (a.workingSessionsCount ?? 0);
  if (connected !== 0) return connected;
  return a.name.localeCompare(b.name);
}

export const CashierGrid = ({ cashiers, onSelect, isLoading }: CashierGridProps) => {
  const [query, setQuery] = useState('');

  const q = normalize(query.trim());
  const isSearching = q.length > 0;

  const sorted = [...cashiers].sort(byRelevance);
  const matched = isSearching ? sorted.filter((c) => normalize(c.name).includes(q)) : sorted;
  const shown = isSearching ? matched : matched.slice(0, VISIBLE_CAP);
  const hiddenCount = matched.length - shown.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-1.5">
      {/* Pinned search — stays put while the grid below scrolls. */}
      <div className="relative shrink-0">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar cajero…"
          aria-label="Buscar cajero"
          className="pl-9"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={`cashier-skeleton-${i}`} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : cashiers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay cajeros para mostrar.</p>
        ) : matched.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No se encontraron cajeros para “{query.trim()}”.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((c) => {
                const connected = c.workingSessionsCount ?? 0;
                const onTurn = c.hasActiveWorkSession ?? false;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onSelect(c.id)}
                    className={cn(
                      'group relative flex items-center gap-3 rounded-xl border border-border bg-card/40 p-3.5 text-left backdrop-blur-sm transition-all',
                      'hover:border-primary/40 hover:bg-primary/[0.07]',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      // Dim cashiers that are neither on shift nor connected.
                      !onTurn && connected === 0 && 'opacity-55',
                    )}
                  >
                    <ContactAvatar
                      className={cn(
                        'size-10 transition-all',
                        // Lemon status ring + glow when the cashier is on shift.
                        // On shift: a soft lemon glow halo — no hard ring.
                        onTurn &&
                          'shadow-[0_0_12px_-1px_color-mix(in_oklab,var(--primary)_50%,transparent)]',
                      )}
                    >
                      {initials(c.name)}
                    </ContactAvatar>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="truncate text-sm font-medium">{c.name}</span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        {onTurn && (
                          <StatusBadge variant="success" icon={CircleDotIcon}>
                            En turno
                          </StatusBadge>
                        )}
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          <SmartphoneIcon className="size-3" />
                          {connected} conectado{connected === 1 ? '' : 's'}
                        </span>
                      </span>
                    </span>
                    <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
                  </button>
                );
              })}
            </div>
            {hiddenCount > 0 && (
              <p className="pt-3 text-center text-xs text-muted-foreground">
                +{hiddenCount} cajero{hiddenCount === 1 ? '' : 's'} más. Buscá por nombre para encontrarlos.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};
