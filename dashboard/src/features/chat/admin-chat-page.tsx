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
import { ArrowLeftIcon } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminCashiers, useCashierSessions } from '@/features/admin/admin-hooks';
import type { ChatScope } from '@/api/chat.service';
import { CashierGrid, type SessionOption } from './components';
import { ChatPage } from './chat-page';

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
    alias: s.alias ?? null,
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

  const handleBackToCashiers = useCallback(() => {
    setSelectedCashierId(null);
  }, []);

  const selectedCashierName =
    cashiers.find((c) => c.id === selectedCashierId)?.name ?? 'Cajero';

  // Slot rendered at the top of the chat's left panel once a cashier is open:
  // a back control that returns to the cashier grid (and shows who's open).
  const cashierBackNode = (
    <button
      type="button"
      onClick={handleBackToCashiers}
      title="Cambiar de cajero"
      className="group glass-subtle flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowLeftIcon className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">
          Cajero
        </span>
        <span className="block truncate text-sm font-medium">{selectedCashierName}</span>
      </span>
    </button>
  );

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4">
      {/* Section title — hidden on mobile to give the chat more vertical space
          (the section is obvious from the nav there). */}
      <div className="hidden md:block">
        <PageHeader
          title="WhatsApp"
          description="Supervisá y enviá mensajes desde las sesiones de los cajeros."
          descriptionClassName="hidden md:block"
        />
      </div>

      {selectedCashierId ? (
        <AdminChatInner
          key={selectedCashierId}
          cashierId={selectedCashierId}
          cashierPicker={cashierBackNode}
        />
      ) : (
        <>
          {/* Floating step header + search + cashier cards — no wrapper box. */}
          <div className="shrink-0">
            <p className="text-base font-medium">Elegí un cajero</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Abrí los chats de un cajero para ver sus conversaciones y responder por él.
            </p>
          </div>
          <CashierGrid
            cashiers={cashiers}
            onSelect={handleSelectCashier}
            isLoading={cashiersLoading}
          />
        </>
      )}
    </section>
  );
};
