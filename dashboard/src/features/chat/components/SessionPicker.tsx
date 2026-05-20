/**
 * SessionPicker.tsx — Displays the cashier's WORKING WhatsApp sessions.
 *
 * - 1 session → static label (no picker needed).
 * - 2+ sessions → shadcn Select dropdown.
 * - 0 sessions → empty state (caller decides, but we render nothing meaningful).
 *
 * Reuses `wahaStatusLabel` / `wahaStatusVariant` from the codebase convention.
 */

import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { wahaStatusLabel, wahaStatusVariant } from '@/lib/waha-status';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SessionOption = {
  id: string;
  /** WAHA session name (e.g. "default") */
  sessionName: string;
  /** WhatsApp phone number, if linked */
  whatsappPhoneNumber: string | null;
  /** WAHA status string */
  wahaStatus: string | null;
};

interface SessionPickerProps {
  sessions: SessionOption[];
  selectedSessionId: string | null;
  onSelect: (sessionId: string) => void;
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

  const label = (s: SessionOption) =>
    s.whatsappPhoneNumber ? `+${s.whatsappPhoneNumber}` : s.sessionName;

  // Single session — render as a static label with status badge
  if (sessions.length === 1) {
    const s = sessions[0]!;
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
        <span className="text-sm font-medium">{label(s)}</span>
        <Badge variant={wahaStatusVariant(s.wahaStatus)}>
          {wahaStatusLabel(s.wahaStatus)}
        </Badge>
      </div>
    );
  }

  // Multiple sessions — show a Select
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
                <span>{label(s)}</span>
                <Badge variant={wahaStatusVariant(s.wahaStatus)}>
                  {wahaStatusLabel(s.wahaStatus)}
                </Badge>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selectedSession && (
        <Badge variant={wahaStatusVariant(selectedSession.wahaStatus)}>
          {wahaStatusLabel(selectedSession.wahaStatus)}
        </Badge>
      )}
    </div>
  );
};
