/**
 * SessionPicker.tsx — Displays the cashier's WORKING WhatsApp sessions.
 *
 * - 1 session → static label (no picker needed).
 * - 2+ sessions → shadcn Select dropdown.
 * - 0 sessions → empty state (caller decides, but we render nothing meaningful).
 *
 * Connection state is a compact dot (yellow = connected, black = disconnected).
 * The displayed name prioritises: alias → phone number → session code.
 * The alias is DISPLAY-ONLY here — it is assigned in the WhatsApp sessions
 * management section (cashier session page / admin sessions panel).
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
// Status dot — yellow when connected (WORKING), black otherwise.
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
        connected ? 'bg-yellow-400' : 'bg-black',
      ].join(' ')}
    />
  );
};

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
      <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
        <StatusDot status={s.wahaStatus} />
        <span className="truncate text-sm font-medium">{sessionLabel(s)}</span>
      </div>
    );
  }

  // Multiple sessions — Select + status dot
  return (
    <div className="flex items-center gap-2">
      <Select
        value={selectedSessionId ?? ''}
        onValueChange={(value: string | null) => {
          if (value) onSelect(value);
        }}
      >
        <SelectTrigger className="w-52">
          <SelectValue placeholder="Seleccioná una sesión" />
        </SelectTrigger>
        <SelectContent>
          {sessions.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              <span className="flex items-center gap-2">
                <StatusDot status={s.wahaStatus} />
                <span>{sessionLabel(s)}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selectedSession && <StatusDot status={selectedSession.wahaStatus} />}
    </div>
  );
};
