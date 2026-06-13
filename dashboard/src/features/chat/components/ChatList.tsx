/**
 * ChatList.tsx — Renders the list of chats for a selected session.
 *
 * Per spec amendment: shows name + relative timestamp only (no body preview).
 * Unread indicator: a yellow notification dot (trailing) when chatId is in
 * `unreadChatIds`. Rows are separated by a divider line for clear delimitation.
 *
 * Relative time uses `date-fns/formatDistanceToNow` (already a dependency).
 */

import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { ChatListEntry } from '@/types/chat';
import { resolveContactTitle } from '../contact';

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
  /** True when more chats can be loaded on demand. */
  hasMore?: boolean;
  /** Loads the next page of older chats. */
  onLoadMore?: () => void;
  /** True while a load-more request is in flight. */
  isLoadingMore?: boolean;
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
  hasMore = false,
  onLoadMore,
  isLoadingMore = false,
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
    <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border">
      {chats.map((chat) => {
        const isSelected = chat.chatId === selectedChatId;
        const isUnread = unreadChatIds?.has(chat.chatId) ?? false;
        const { title: displayName } = resolveContactTitle(chat);

        return (
          <li key={chat.chatId}>
            <button
              type="button"
              onClick={() => onSelect(chat.chatId)}
              className={[
                'group flex w-full items-center gap-3 px-3 py-3 text-left transition-colors',
                isSelected
                  ? 'bg-primary/10 text-primary'
                  : 'hover:bg-muted/60 text-foreground',
              ].join(' ')}
            >
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

              {/* Unread notification dot — yellow circle, trailing. */}
              {isUnread && (
                <span
                  role="status"
                  aria-label="Mensaje sin leer"
                  className="size-2.5 shrink-0 rounded-full bg-yellow-400 shadow-[0_0_0_3px_rgba(250,204,21,0.25)]"
                />
              )}
            </button>
          </li>
        );
      })}

      {/* Load more — fetches the next page of older chats on demand. */}
      {hasMore && (
        <li className="p-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={onLoadMore}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? 'Cargando…' : 'Cargar más chats'}
          </Button>
        </li>
      )}
    </ul>
  );
};
