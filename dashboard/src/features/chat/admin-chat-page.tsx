/**
 * admin-chat-page.tsx — /admin/chat route component.
 *
 * Allows ADMIN / SUPER_ADMIN to:
 *   1. Pick a cashier from the full cashier list.
 *   2. View that cashier's WhatsApp sessions in the session picker.
 *   3. Select a session and chat to view/send messages.
 *
 * Data sources (reuse existing hooks — no duplicated fetching):
 *   - Cashier list:          useAdminCashiers  (admin-hooks.ts)
 *   - Cashier sessions:      useCashierSessions(cashierId) (admin-hooks.ts)
 *
 * Scope switches to { kind: 'admin', cashierId } after a cashier is picked.
 * Until then, a friendly empty state is shown.
 *
 * Spec §Admin Chat Route scenarios:
 *   - Admin picks cashier → session → chat → thread renders.
 *   - Admin sends text → delivered from cashier's number.
 */

import { useCallback, useState } from 'react';
import { UsersIcon } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/common/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminCashiers, useCashierSessions } from '@/features/admin/admin-hooks';
import type { ChatScope } from '@/api/chat.service';
import type { SessionOption } from './components';
import { ChatPage } from './chat-page';

// ---------------------------------------------------------------------------
// Cashier picker sub-component
// ---------------------------------------------------------------------------

interface CashierPickerProps {
  cashiers: { id: string; name: string }[];
  selectedCashierId: string | null;
  onSelect: (cashierId: string) => void;
  isLoading?: boolean;
}

const CashierPicker = ({
  cashiers,
  selectedCashierId,
  onSelect,
  isLoading,
}: CashierPickerProps) => {
  if (isLoading) {
    return <Skeleton className="h-9 w-full rounded-md" />;
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium text-muted-foreground">Cajero</p>
      <Select
        value={selectedCashierId ?? ''}
        onValueChange={(value: string | null) => {
          if (value) onSelect(value);
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Elegí un cajero..." />
        </SelectTrigger>
        <SelectContent>
          {cashiers.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Empty state — before cashier is selected
// ---------------------------------------------------------------------------

const NoCashierSelected = () => (
  <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center">
    <UsersIcon className="size-10 text-muted-foreground/50" />
    <p className="text-sm text-muted-foreground">
      Elegí un cajero para ver sus chats
    </p>
  </div>
);

// ---------------------------------------------------------------------------
// Inner component — loads sessions for a specific cashier
// ---------------------------------------------------------------------------

interface AdminChatInnerProps {
  cashierId: string;
  cashierPicker: React.ReactNode;
}

const AdminChatInner = ({ cashierId, cashierPicker }: AdminChatInnerProps) => {
  const scope: ChatScope = { kind: 'admin', cashierId };

  const { data: sessions = [], isLoading } = useCashierSessions(cashierId);

  const workingSessions: SessionOption[] = sessions.map((s) => ({
    id: s.id,
    sessionName: s.sessionName,
    whatsappPhoneNumber: s.whatsappPhoneNumber ?? null,
    wahaStatus: s.wahaStatus ?? null,
  }));

  const noSessionsCta = isLoading ? (
    <Skeleton className="h-16 w-full rounded-xl" />
  ) : (
    <div className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
      Este cajero no tiene sesiones de WhatsApp.
    </div>
  );

  return (
    <ChatPage
      scope={scope}
      sessions={isLoading ? [] : workingSessions}
      cashierPicker={cashierPicker}
      emptyCta={noSessionsCta}
    />
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const AdminChatPage = () => {
  const { data: cashiers = [], isLoading: cashiersLoading } = useAdminCashiers();
  const [selectedCashierId, setSelectedCashierId] = useState<string | null>(null);

  // Keep selected cashier in sync with the list (handles deletion).
  // Clear during render — avoids cascading re-render lint warning.
  const cashierStillExists =
    selectedCashierId === null ||
    cashiers.some((c) => c.id === selectedCashierId);
  if (!cashierStillExists) {
    setSelectedCashierId(null);
  }

  const handleSelectCashier = useCallback((cashierId: string) => {
    setSelectedCashierId(cashierId);
  }, []);

  const cashierPickerNode = (
    <CashierPicker
      cashiers={cashiers}
      selectedCashierId={selectedCashierId}
      onSelect={handleSelectCashier}
      isLoading={cashiersLoading}
    />
  );

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        title="WhatsApp"
        description="Supervisá y enviá mensajes desde las sesiones de los cajeros."
      />

      {selectedCashierId ? (
        <AdminChatInner
          key={selectedCashierId}
          cashierId={selectedCashierId}
          cashierPicker={cashierPickerNode}
        />
      ) : (
        <div className="flex h-[calc(100svh-8rem)] flex-col overflow-hidden rounded-2xl border bg-card shadow-sm md:h-[calc(100svh-6rem)]">
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
            {cashierPickerNode}
            <NoCashierSelected />
          </div>
        </div>
      )}
    </section>
  );
};
