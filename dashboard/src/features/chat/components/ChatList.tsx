/**
 * ChatList.tsx — Renders the list of chats for a selected session.
 *
 * Per spec amendment: shows name + compact timestamp only (no body preview —
 * WAHA does not return a preview in V1). Unread indicator: a lime (primary) dot
 * (trailing) when chatId is in `unreadChatIds`. The selected row is marked with
 * a left accent bar (not a full primary tint) so it stays sober.
 */

import { UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { ChatListEntry } from '@/types/chat';
import { resolveContactTitle } from '../contact';
import { formatListTime } from '../time';
import { ContactAvatar } from './contact-avatar';

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
    // shrink-0 keeps the <ul> at its content height (not squashed to the scroll
    // container's height), so the parent scroll region scrolls the rows instead.
    // No outer border/radius: the list is flush rows separated by divide-y, so it
    // can't collide with the header or the card edge while scrolling.
    <ul className="flex shrink-0 flex-col divide-y divide-border">
      {chats.map((chat) => {
        const isSelected = chat.chatId === selectedChatId;
        const isUnread = unreadChatIds?.has(chat.chatId) ?? false;
        const { title: displayName, isPhone } = resolveContactTitle(chat);

        return (
          <li key={chat.chatId}>
            <button
              type="button"
              onClick={() => onSelect(chat.chatId)}
              className={cn(
                'group relative flex w-full items-center gap-3 px-3 py-3 text-left text-foreground transition-colors',
                isSelected ? 'bg-muted/50' : 'hover:bg-muted/60',
              )}
            >
              {/* Selected accent bar — sober alternative to a full primary tint. */}
              {isSelected && (
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-[3px] rounded-r-full bg-primary"
                />
              )}

              {/* Avatar — initial of the saved name, or a person icon for numbers. */}
              <ContactAvatar className="size-9">
                {isPhone ? <UserIcon className="size-4" /> : displayName.charAt(0).toUpperCase()}
              </ContactAvatar>

              {/* Name */}
              <p
                className={cn(
                  'min-w-0 flex-1 truncate text-sm',
                  isUnread ? 'font-semibold' : 'font-medium',
                )}
              >
                {displayName}
              </p>

              {/* Trailing cluster — compact timestamp + unread dot. */}
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={cn(
                    'text-xs tabular-nums',
                    isUnread ? 'font-medium text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {formatListTime(chat.lastMessageTimestamp)}
                </span>
                {isUnread && (
                  <span
                    role="status"
                    aria-label="Mensaje sin leer"
                    className="size-2.5 rounded-full bg-primary shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_25%,transparent)]"
                  />
                )}
              </div>
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
