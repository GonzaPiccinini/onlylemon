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
import { resolveContactTitle } from '../contact';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatHeaderProps {
  chat: ChatListEntry;
  /** When provided (mobile), renders a back button on the left. */
  onBack?: () => void;
  /**
   * Display name of the WhatsApp session being used (alias → phone → code).
   * Shown as a subtitle so the user always sees which number they're on.
   */
  sessionLabel?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ChatHeader = ({ chat, onBack, sessionLabel }: ChatHeaderProps) => {
  const { title, isPhone } = resolveContactTitle(chat);
  const initial = !isPhone ? title.charAt(0).toUpperCase() : null;

  return (
    <div className="flex shrink-0 items-center gap-3 border-b bg-black px-3 py-2.5">
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
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground">
        {initial ?? <UserIcon className="size-4" />}
      </div>

      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">{title}</span>
        {sessionLabel && (
          <span className="truncate text-xs text-muted-foreground">
            {sessionLabel}
          </span>
        )}
      </div>
    </div>
  );
};
