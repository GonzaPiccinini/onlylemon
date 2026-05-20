/**
 * MessageThread.tsx — Scrollable list of chat messages.
 *
 * Features:
 *   - Auto-scroll to bottom on new messages when the user is already near the
 *     bottom (within 120 px). Does not hijack scroll when user is reading old
 *     messages.
 *   - "Cargar mensajes anteriores" button at the top when `hasOlder` is true.
 *   - Delegates per-message rendering to MessageItem.
 *   - Loading skeleton while initial history is fetching.
 *   - Propagates `onReply` / `onReact` callbacks upward.
 */

import { useEffect, useRef } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { MessageItem } from './MessageItem';
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
  const prevLengthRef = useRef(messages.length);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const grew = messages.length > prevLengthRef.current;
    prevLengthRef.current = messages.length;

    if (!grew) return;

    // Only auto-scroll if the user is near the bottom
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom <= NEAR_BOTTOM_THRESHOLD) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [messages.length]);

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
      className="flex flex-1 flex-col gap-3 overflow-y-auto p-4"
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

      {messages.map((msg) => (
        <MessageItem
          key={msg.id}
          message={msg}
          scope={scope}
          sessionId={sessionId}
          chatId={chatId}
          onReply={onReply}
          onReact={onReact}
        />
      ))}
    </div>
  );
};
