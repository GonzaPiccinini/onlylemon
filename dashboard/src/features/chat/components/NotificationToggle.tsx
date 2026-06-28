/**
 * NotificationToggle.tsx — Opt-in control for in-app browser notifications.
 *
 * Browsers require a user gesture to prompt for notification permission, so we
 * surface a compact icon button. Once granted (or denied) it collapses into a
 * non-interactive status icon. Renders nothing when the API is unsupported.
 *
 * Lives in the WhatsApp section's airy icon action row (chat-page) alongside
 * "Publicar estado" — so it is icon-only and matches the icon-sm sizing.
 */

import { BellIcon, BellOffIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNotificationPermission } from '../hooks';

export const NotificationToggle = () => {
  const { permission, enable } = useNotificationPermission();

  if (permission === 'unsupported') return null;

  if (permission === 'granted') {
    return (
      <span
        title="Avisos activados"
        aria-label="Avisos activados"
        className="grid size-7 shrink-0 place-items-center rounded-md text-primary/70"
      >
        <BellIcon className="size-4" />
      </span>
    );
  }

  if (permission === 'denied') {
    return (
      <span
        title="Las notificaciones están bloqueadas. Habilitalas en la configuración del navegador para este sitio."
        aria-label="Avisos bloqueados"
        className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground/60"
      >
        <BellOffIcon className="size-4" />
      </span>
    );
  }

  // permission === 'default' — not yet asked.
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={() => void enable()}
      title="Activar avisos"
      aria-label="Activar avisos"
      className="text-muted-foreground hover:text-foreground"
    >
      <BellIcon className="size-4" />
    </Button>
  );
};
