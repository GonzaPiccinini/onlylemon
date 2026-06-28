/**
 * SessionPicker.tsx — Displays the cashier's WORKING WhatsApp sessions.
 *
 * - 1 session → static label (no picker needed).
 * - 2+ sessions → a CUSTOM dropdown (built in-house, not the shadcn/base-ui
 *   Select primitive) so it matches the dashboard's lemon/dark theme exactly
 *   and we fully own its look & behaviour.
 *
 * Connection state is a compact dot (teal = connected, gray = disconnected).
 * The displayed name prioritises: alias → phone number → session code.
 * The alias is DISPLAY-ONLY here — it is assigned in the WhatsApp sessions
 * management section (cashier session page / admin sessions panel).
 */

import * as React from 'react';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { wahaStatusLabel } from '@/lib/waha-status';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SessionOption = {
  id: string;
  /** WAHA session name (e.g. "default") */
  sessionName: string;
  /** WhatsApp phone number, if linked */
  whatsappPhoneNumber: string | null;
  /** Human-friendly alias, if set */
  alias?: string | null;
  /** WAHA status string */
  wahaStatus: string | null;
};

interface SessionPickerProps {
  sessions: SessionOption[];
  selectedSessionId: string | null;
  onSelect: (sessionId: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Display name: alias → +phone → session code. */
function sessionLabel(s: SessionOption): string {
  if (s.alias && s.alias.trim()) return s.alias;
  if (s.whatsappPhoneNumber) return `+${s.whatsappPhoneNumber}`;
  return s.sessionName;
}

// ---------------------------------------------------------------------------
// Status dot — teal (with a soft glow) when connected (WORKING), muted grey
// otherwise.
// ---------------------------------------------------------------------------

const StatusDot = ({ status }: { status: string | null }) => {
  const connected = status === 'WORKING';
  const label = wahaStatusLabel(status);
  return (
    <span
      title={label}
      aria-label={label}
      className={[
        'inline-block size-2.5 shrink-0 rounded-full',
        connected
          ? 'bg-[var(--accent-violet)] glow-ring-violet'
          : 'bg-muted-foreground/40',
      ].join(' ')}
    />
  );
};

// ---------------------------------------------------------------------------
// Custom dropdown (2+ sessions) — owns its markup, theme tokens & a11y.
// ---------------------------------------------------------------------------

function SessionSelect({
  sessions,
  selectedSession,
  onSelect,
}: {
  sessions: SessionOption[];
  selectedSession: SessionOption | undefined;
  onSelect: (sessionId: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const optionRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const listboxId = React.useId();

  const selectedIndex = sessions.findIndex((s) => s.id === selectedSession?.id);

  // Close when clicking outside the picker.
  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // On open: highlight the current session (or first) and move focus into it.
  React.useEffect(() => {
    if (!open) return;
    const idx = selectedIndex >= 0 ? selectedIndex : 0;
    setActiveIndex(idx);
    const raf = requestAnimationFrame(() => optionRefs.current[idx]?.focus());
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const focusOption = (idx: number) => {
    setActiveIndex(idx);
    optionRefs.current[idx]?.focus();
  };

  const commit = (idx: number) => {
    const s = sessions[idx];
    if (s) onSelect(s.id);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      setOpen(true);
    }
  };

  const onListKeyDown = (e: React.KeyboardEvent) => {
    const last = sessions.length - 1;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusOption(activeIndex >= last ? 0 : activeIndex + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusOption(activeIndex <= 0 ? last : activeIndex - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusOption(0);
        break;
      case 'End':
        e.preventDefault();
        focusOption(last);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        commit(activeIndex);
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        break;
      case 'Tab':
        setOpen(false);
        break;
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          'group glass-subtle flex w-full items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left text-sm font-medium text-foreground transition-colors',
          'hover:border-border hover:bg-accent/40',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
          open && 'border-border bg-accent/40',
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          {selectedSession ? (
            <>
              <StatusDot status={selectedSession.wahaStatus} />
              <span className="truncate">{sessionLabel(selectedSession)}</span>
            </>
          ) : (
            <span className="truncate text-muted-foreground">
              Seleccioná una sesión
            </span>
          )}
        </span>
        <ChevronDownIcon
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Sesiones de WhatsApp"
          aria-activedescendant={`${listboxId}-opt-${activeIndex}`}
          tabIndex={-1}
          onKeyDown={onListKeyDown}
          className={cn(
            'absolute inset-x-0 top-full z-50 mt-1.5 origin-top max-h-28 overflow-y-auto scrollbar-thin rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10',
            'animate-in fade-in-0 zoom-in-95 duration-100',
          )}
        >
          {sessions.map((s, idx) => {
            const isSelected = s.id === selectedSession?.id;
            const isActive = idx === activeIndex;
            return (
              <button
                key={s.id}
                ref={(el) => {
                  optionRefs.current[idx] = el;
                }}
                id={`${listboxId}-opt-${idx}`}
                type="button"
                role="option"
                aria-selected={isSelected}
                tabIndex={isActive ? 0 : -1}
                data-active={isActive}
                onClick={() => commit(idx)}
                onMouseMove={() => setActiveIndex(idx)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition-colors',
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-popover-foreground',
                )}
              >
                <StatusDot status={s.wahaStatus} />
                <span
                  className={cn('min-w-0 flex-1 truncate', isSelected && 'font-medium')}
                >
                  {sessionLabel(s)}
                </span>
                {isSelected && <CheckIcon className="size-4 shrink-0 text-primary" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const SessionPicker = ({
  sessions,
  selectedSessionId,
  onSelect,
}: SessionPickerProps) => {
  if (sessions.length === 0) return null;

  const selectedSession = sessions.find((s) => s.id === selectedSessionId);

  // Single session — static label with status dot
  if (sessions.length === 1) {
    const s = sessions[0]!;
    return (
      <div className="glass-subtle flex items-center gap-2 rounded-lg px-3 py-1.5">
        <StatusDot status={s.wahaStatus} />
        <span className="truncate text-sm font-medium">{sessionLabel(s)}</span>
      </div>
    );
  }

  // Multiple sessions — custom dropdown
  return (
    <SessionSelect
      sessions={sessions}
      selectedSession={selectedSession}
      onSelect={onSelect}
    />
  );
};
