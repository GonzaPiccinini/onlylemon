/**
 * NotificationToggle.tsx — Opt-in control for in-app browser notifications.
 *
 * Browsers require a user gesture to prompt for notification permission, so we
 * surface a small button. Once granted (or denied) it collapses into a compact
 * status row. Renders nothing when the API is unsupported.
 */

import { BellIcon, BellOffIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNotificationPermission } from '../hooks';

export const NotificationToggle = () => {
  const { permission, enable } = useNotificationPermission();

  if (permission === 'unsupported') return null;

  if (permission === 'granted') {
    return (
      <div className="glass rounded-lg p-1">
        <div className="flex shrink-0 items-center gap-2 px-1 text-xs text-muted-foreground">
          <BellIcon className="size-3.5" />
          Avisos activados
        </div>
      </div>
    );
  }

  if (permission === 'denied') {
    return (
      <div className="glass rounded-lg p-1">
        <div
          className="flex shrink-0 items-center gap-2 px-1 text-xs text-muted-foreground"
          title="Las notificaciones están bloqueadas. Habilitalas en la configuración del navegador para este sitio."
        >
          <BellOffIcon className="size-3.5" />
          Avisos bloqueados
        </div>
      </div>
    );
  }

  // permission === 'default' — not yet asked.
  return (
    <div className="glass rounded-lg p-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => void enable()}
        className="w-full justify-start gap-2"
      >
        <BellIcon className="size-4" />
        Activar avisos
      </Button>
    </div>
  );
};
