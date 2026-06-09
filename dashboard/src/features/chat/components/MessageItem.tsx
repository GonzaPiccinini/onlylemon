/**
 * MessageItem.tsx — Renders a single chat message bubble.
 *
 * Features:
 *   - Left-aligned (inbound) vs right-aligned (outbound/fromMe).
 *   - `quotedMessage` → QuotedReply preview block above the body.
 *   - `hasMedia` → MediaPreview block.
 *   - `reactions` → small emoji badges attached below the bubble.
 *   - Hover actions: reply and react buttons (react opens EmojiPicker).
 *   - Timestamp shown small + muted at the bottom of the bubble.
 *
 * `onReply` and `onReact` are passed from MessageThread so the actions
 * propagate up through the component tree without direct API calls here.
 */

import { useState } from 'react';
import { ReplyIcon, SmilePlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QuotedReply } from './QuotedReply';
import { MediaPreview } from './MediaPreview';
import { isStickerMime } from '../mime';
import { EmojiPicker } from './EmojiPicker';
import { formatMessageTime } from '../time';
import type { ChatMessage } from '@/types/chat';
import type { ChatScope } from '@/api/chat.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MessageItemProps {
  message: ChatMessage;
  scope: ChatScope;
  sessionId: string;
  chatId: string;
  onReply: (message: ChatMessage) => void;
  onReact: (messageId: string, emoji: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const MessageItem = ({
  message,
  scope,
  sessionId,
  chatId,
  onReply,
  onReact,
}: MessageItemProps) => {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const { fromMe, body, hasMedia, mediaMimetype, quotedMessage, reactions, timestamp } = message;

  const handleEmojiPick = (emoji: string) => {
    onReact(message.id, emoji);
    setShowEmojiPicker(false);
  };

  // Sticker-only messages render without a bubble (WhatsApp style).
  const isStickerOnly = hasMedia && isStickerMime(mediaMimetype) && !body && !quotedMessage;

  return (
    <div
      className={[
        'group flex flex-col gap-0.5',
        fromMe ? 'items-end' : 'items-start',
      ].join(' ')}
    >
      {/* Action buttons — visible on hover */}
      <div
        className={[
          'flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100',
          fromMe ? 'flex-row-reverse' : 'flex-row',
        ].join(' ')}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => onReply(message)}
          aria-label="Responder"
          title="Responder"
        >
          <ReplyIcon className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setShowEmojiPicker(true)}
          aria-label="Reaccionar"
          title="Reaccionar"
        >
          <SmilePlusIcon className="size-3.5" />
        </Button>
      </div>

      {/* Bubble */}
      <div
        className={[
          'flex max-w-xs flex-col gap-1.5 rounded-2xl text-sm sm:max-w-md',
          isStickerOnly
            ? 'bg-transparent px-0 py-0'
            : 'px-3 py-2 shadow-sm ' +
              (fromMe
                ? 'rounded-br-sm bg-primary text-primary-foreground'
                : 'rounded-bl-sm bg-muted text-foreground'),
        ].join(' ')}
      >
        {/* Quoted reply preview */}
        {quotedMessage && (
          <QuotedReply quoted={quotedMessage} />
        )}

        {/* Media */}
        {hasMedia && (
          <MediaPreview
            scope={scope}
            sessionId={sessionId}
            chatId={chatId}
            messageId={message.id}
            mimetype={mediaMimetype}
          />
        )}

        {/* Text body */}
        {body && (
          <p className="whitespace-pre-wrap break-words">{body}</p>
        )}

        {/* Timestamp */}
        <p
          className={[
            'self-end text-xs',
            !isStickerOnly && fromMe ? 'text-primary-foreground/60' : 'text-muted-foreground',
          ].join(' ')}
        >
          {formatMessageTime(timestamp)}
        </p>
      </div>

      {/* Reactions row */}
      {reactions.length > 0 && (
        <div className="flex flex-wrap gap-0.5 px-1">
          {reactions.map((r, idx) => (
            <span
              key={idx}
              title={r.fromMe ? 'Tú reaccionaste' : 'Reacción recibida'}
              className="cursor-default select-none text-base leading-none"
            >
              {r.emoji}
            </span>
          ))}
        </div>
      )}

      {/* Emoji picker */}
      {showEmojiPicker && (
        <EmojiPicker
          onPick={handleEmojiPick}
          onClose={() => setShowEmojiPicker(false)}
        />
      )}
    </div>
  );
};
