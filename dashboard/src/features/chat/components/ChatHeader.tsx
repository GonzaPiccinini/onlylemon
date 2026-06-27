/**
 * ChatHeader.tsx — Top bar of the conversation pane.
 *
 * Shows the other party's identity:
 *   - If the contact is saved (displayName present) → the contact name.
 *   - Otherwise → the phone number derived from the chatId (`<number>@c.us`).
 *
 * On mobile an optional back arrow (onBack) is rendered to return to the list.
 */

import { ArrowLeftIcon, UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ChatListEntry } from '@/types/chat';
import { resolveContactTitle, resolveContactPhone } from '../contact';
import { ContactAvatar } from './contact-avatar';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatHeaderProps {
  chat: ChatListEntry;
  /** When provided (mobile), renders a back button on the left. */
  onBack?: () => void;
  /**
   * WhatsApp session label (alias → phone → code) the cashier is chatting from.
   * Passed only on mobile (on desktop it's visible in the always-on session
   * picker). Rendered with a "Sesión:" prefix so it can't be confused with the
   * contact's phone number shown above it.
   */
  sessionLabel?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ChatHeader = ({ chat, onBack, sessionLabel }: ChatHeaderProps) => {
  const { title, isPhone } = resolveContactTitle(chat);
  const initial = !isPhone ? title.charAt(0).toUpperCase() : null;
  // Show the contact's phone under their name. Skip it when the title is already
  // the phone (unsaved contact) or when the chat has no real phone (group/@lid).
  const contactPhone = isPhone ? null : resolveContactPhone(chat);

  return (
    <div className="flex shrink-0 items-center gap-3 border-b px-3 py-2.5">
      {onBack && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Volver a la lista"
          onClick={onBack}
          className="shrink-0"
        >
          <ArrowLeftIcon className="size-4" />
        </Button>
      )}

      {/* Avatar — initial of the saved name, or a person icon for numbers. */}
      <ContactAvatar className="size-9">
        {initial ?? <UserIcon className="size-4" />}
      </ContactAvatar>

      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">{title}</span>
        {contactPhone && (
          <span className="truncate text-xs text-muted-foreground">
            {contactPhone}
          </span>
        )}
        {sessionLabel && (
          <span className="truncate text-xs text-muted-foreground">
            Sesión: {sessionLabel}
          </span>
        )}
      </div>
    </div>
  );
};
