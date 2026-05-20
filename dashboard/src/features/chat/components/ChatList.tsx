/**
 * ChatList.tsx — Renders the list of chats for a selected session.
 *
 * Per spec amendment: shows name + relative timestamp only (no body preview).
 * Unread indicator: small dot when chatId is in `unreadChatIds`.
 *
 * Relative time uses `date-fns/formatDistanceToNow` (already a dependency).
 */

import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';
import type { ChatListEntry } from '@/types/chat';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatListProps {
  chats: ChatListEntry[];
  selectedChatId: string | null;
  onSelect: (chatId: string) => void;
  /** Set of chatIds that have unread messages (drives the dot indicator). */
  unreadChatIds?: Set<string>;
  isLoading?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(timestamp: number): string {
  try {
    return formatDistanceToNow(new Date(timestamp * 1000), {
      addSuffix: true,
      locale: es,
    });
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ChatList = ({
  chats,
  selectedChatId,
  onSelect,
  unreadChatIds,
  isLoading = false,
}: ChatListProps) => {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-1 p-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (chats.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center text-sm text-muted-foreground">
        <p>No hay chats todavía</p>
        <p className="text-xs">Los mensajes aparecerán aquí cuando lleguen.</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-0.5 p-1.5">
      {chats.map((chat) => {
        const isSelected = chat.chatId === selectedChatId;
        const isUnread = unreadChatIds?.has(chat.chatId) ?? false;
        const displayName = chat.displayName ?? chat.chatId;

        return (
          <li key={chat.chatId}>
            <button
              type="button"
              onClick={() => onSelect(chat.chatId)}
              className={[
                'group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                isSelected
                  ? 'bg-primary/10 text-primary'
                  : 'hover:bg-muted/60 text-foreground',
              ].join(' ')}
            >
              {/* Unread indicator dot */}
              <span
                className={[
                  'size-2 shrink-0 rounded-full',
                  isUnread ? 'bg-primary' : 'bg-transparent',
                ].join(' ')}
                aria-hidden={!isUnread}
              />

              {/* Name + timestamp */}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p
                  className={[
                    'truncate text-sm',
                    isUnread ? 'font-semibold' : 'font-medium',
                  ].join(' ')}
                >
                  {displayName}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {relativeTime(chat.lastMessageTimestamp)}
                </p>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
};
