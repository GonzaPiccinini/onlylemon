/**
 * MessageThread.tsx — Scrollable list of chat messages.
 *
 * Messages arrive oldest→newest (sorted by the parent), WhatsApp-style:
 * oldest at the top, newest at the bottom.
 *
 * Scroll behaviour:
 *   - On chat open / first load → jump instantly to the bottom (newest).
 *   - On a new incoming/sent message while the user is near the bottom →
 *     smooth-scroll to follow it. Does not hijack scroll when the user is
 *     reading history.
 *   - On "Cargar mensajes anteriores" (older messages prepended at the top) →
 *     preserve the viewport so the message being read stays put.
 *
 * "Cargar mensajes anteriores" button at the top when `hasOlder` is true.
 * Delegates per-message rendering to MessageItem.
 */

import { Fragment, useLayoutEffect, useRef } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { MessageItem } from './MessageItem';
import { formatDayLabel, isSameDay } from '../time';
import type { ChatMessage } from '@/types/chat';
import type { ChatScope } from '@/api/chat.service';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NEAR_BOTTOM_THRESHOLD = 120; // px

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MessageThreadProps {
  messages: ChatMessage[];
  scope: ChatScope;
  sessionId: string;
  chatId: string;
  isLoading: boolean;
  hasOlder: boolean;
  onLoadOlder: () => void;
  onReply: (message: ChatMessage) => void;
  onReact: (messageId: string, emoji: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const MessageThread = ({
  messages,
  scope,
  sessionId,
  chatId,
  isLoading,
  hasOlder,
  onLoadOlder,
  onReply,
  onReact,
}: MessageThreadProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevChatIdRef = useRef(chatId);
  const prevLengthRef = useRef(0);
  const prevScrollHeightRef = useRef(0);

  // useLayoutEffect: adjust scroll before the browser paints to avoid flicker
  // (especially when preserving position after prepending older messages).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const chatChanged = prevChatIdRef.current !== chatId;
    const firstLoad = prevLengthRef.current === 0 && messages.length > 0;
    const grew = messages.length > prevLengthRef.current;

    // Was the user near the bottom BEFORE this update? Use the previous
    // scrollHeight so a just-prepended page doesn't skew the measurement.
    const wasNearBottom =
      prevScrollHeightRef.current - el.scrollTop - el.clientHeight <=
      NEAR_BOTTOM_THRESHOLD;

    if (chatChanged || firstLoad) {
      // Open a chat → land at the newest message instantly.
      el.scrollTop = el.scrollHeight;
    } else if (grew) {
      if (wasNearBottom) {
        // New incoming/sent message at the bottom → follow it.
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      } else {
        // Older messages prepended at the top → keep the viewport anchored.
        el.scrollTop += el.scrollHeight - prevScrollHeightRef.current;
      }
    }

    prevChatIdRef.current = chatId;
    prevLengthRef.current = messages.length;
    prevScrollHeightRef.current = el.scrollHeight;
  }, [messages.length, chatId]);

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col gap-2 overflow-hidden p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={['flex', i % 2 === 0 ? 'justify-end' : 'justify-start'].join(' ')}
          >
            <Skeleton className={['h-10 rounded-2xl', i % 3 === 0 ? 'w-40' : 'w-56'].join(' ')} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-4"
    >
      {/* Load older messages */}
      {hasOlder && (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onLoadOlder}
          >
            Cargar mensajes anteriores
          </Button>
        </div>
      )}

      {messages.length === 0 && !isLoading && (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          No hay mensajes en este chat.
        </div>
      )}

      {messages.map((msg, i) => {
        const prev = i > 0 ? messages[i - 1] : undefined;
        const showDayDivider =
          !prev || !isSameDay(prev.timestamp, msg.timestamp);
        return (
          <Fragment key={msg.id}>
            {showDayDivider && (
              <div className="sticky top-0 z-10 flex justify-center py-1">
                <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
                  {formatDayLabel(msg.timestamp)}
                </span>
              </div>
            )}
            <MessageItem
              message={msg}
              scope={scope}
              sessionId={sessionId}
              chatId={chatId}
              onReply={onReply}
              onReact={onReact}
            />
          </Fragment>
        );
      })}
    </div>
  );
};
