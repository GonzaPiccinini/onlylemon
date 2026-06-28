/**
 * ChatEmptyState.tsx — Centered placeholder for the chat surface: a green badge,
 * a heading, and a one-line next step. Used before a chat is open (conversation
 * pane) and before a cashier is picked (admin). An empty screen is an invitation
 * to act, so each caller names the concrete next step.
 */

import type { LucideIcon } from 'lucide-react';

interface ChatEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export const ChatEmptyState = ({ icon: Icon, title, description }: ChatEmptyStateProps) => {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
      {/* WhatsApp-green badge — the single accent that frames this as the inbox. */}
      <div className="flex size-16 items-center justify-center rounded-full bg-whatsapp/10 ring-1 ring-whatsapp/20">
        <Icon className="size-7 text-whatsapp" />
      </div>
      <div className="flex max-w-xs flex-col gap-1.5">
        <p className="text-base font-medium">{title}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </div>
  );
};
