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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatHeaderProps {
  chat: ChatListEntry;
  /** When provided (mobile), renders a back button on the left. */
  onBack?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolves the title shown in the header.
 * Returns the saved contact name when available, otherwise the phone number
 * (prefixed with "+"). `isPhone` flags when the title is a bare number so the
 * avatar can fall back to an icon instead of an initial.
 */
function resolveTitle(chat: ChatListEntry): { title: string; isPhone: boolean } {
  const name = chat.displayName?.trim();
  const local = chat.chatId.split('@')[0] ?? '';

  // A real saved name (not just the bare number) → use it.
  if (name && !/^\d+$/.test(name)) {
    return { title: name, isPhone: false };
  }

  // No name (or the "name" is just digits) → show the phone number.
  const digits = name && /^\d+$/.test(name) ? name : local;
  const title = /^\d+$/.test(digits) ? `+${digits}` : digits;
  return { title, isPhone: true };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ChatHeader = ({ chat, onBack }: ChatHeaderProps) => {
  const { title, isPhone } = resolveTitle(chat);
  const initial = !isPhone ? title.charAt(0).toUpperCase() : null;

  return (
    <div className="flex shrink-0 items-center gap-3 border-b bg-card px-3 py-2.5">
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

      <span className="truncate text-sm font-medium">{title}</span>
    </div>
  );
};
