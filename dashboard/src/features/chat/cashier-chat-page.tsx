/**
 * cashier-chat-page.tsx — /cashier/chat route component.
 *
 * Loads the cashier's own WORKING WhatsApp sessions and renders the shared
 * ChatPage layout.
 *
 * Spec §Cashier Chat Route:
 *   - 0 WORKING sessions → CTA linking to /cashier.
 *   - 1+ WORKING sessions → ChatPage with those sessions.
 *   - Session/chat persistence via useLastSession / useLastChat (inside ChatPage).
 *
 * useMySessions returns ALL of the cashier's sessions; we filter to WORKING here
 * so the picker only shows connected sessions.
 */

import { Link } from 'react-router-dom';
import { SmartphoneIcon } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/auth-context';
import { useMySessions } from '@/features/cashier/cashier-hooks';
import type { SessionOption } from './components';
import { ChatPage } from './chat-page';

// ---------------------------------------------------------------------------
// CTA — rendered when the cashier has no WORKING sessions
// ---------------------------------------------------------------------------

const NoSessionsCta = () => (
  <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed p-8 text-center">
    <SmartphoneIcon className="size-10 text-muted-foreground/50" />
    <div className="flex flex-col gap-1">
      <p className="text-sm font-medium">Sin WhatsApp conectado</p>
      <p className="text-xs text-muted-foreground">
        Conectá un WhatsApp para empezar a chatear con tus clientes.
      </p>
    </div>
    <Button render={<Link to="/cashier" />}>
      Ir a Sesión y WhatsApp
    </Button>
  </div>
);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const CashierChatPage = () => {
  const { user } = useAuth();
  const { data: allSessions = [], isLoading } = useMySessions();

  // Build the cashier scope with the cashier's own id for localStorage key
  // scoping (Design Addendum §Session selector persistence). Falls back to an
  // empty string when the user record is not yet loaded — the scope is only
  // used for localStorage key generation, so this is safe.
  const cashierScope = { kind: 'cashier' as const, cashierId: user?.cashierId ?? '' };

  // Filter to WORKING sessions only
  const workingSessions: SessionOption[] = allSessions
    .filter((s) => s.wahaStatus === 'WORKING')
    .map((s) => ({
      id: s.id,
      sessionName: s.sessionName,
      whatsappPhoneNumber: s.whatsappPhoneNumber ?? null,
      alias: s.alias ?? null,
      wahaStatus: s.wahaStatus ?? null,
    }));

  if (isLoading) {
    return (
      <section className="flex min-h-0 flex-1 flex-col gap-4">
        {/* Section title — hidden on mobile to give the chat more vertical space
            (the section is obvious from the nav there). */}
        <div className="hidden md:block">
          <PageHeader
            title="WhatsApp"
            description="Cargando sesiones de WhatsApp..."
            descriptionClassName="hidden md:block"
          />
        </div>
        <Skeleton className="h-[400px] w-full rounded-2xl" />
      </section>
    );
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4">
      {/* Section title — hidden on mobile to give the chat more vertical space
          (the section is obvious from the nav there). */}
      <div className="hidden md:block">
        <PageHeader
          title="WhatsApp"
          description="Chateá con tus clientes desde tus sesiones de WhatsApp."
          descriptionClassName="hidden md:block"
        />
      </div>
      <ChatPage
        scope={cashierScope}
        sessions={workingSessions}
        emptyCta={<NoSessionsCta />}
      />
    </section>
  );
};
