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

import { useEffect, useRef, useState } from 'react';
import { ReplyIcon, SmilePlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { QuotedReply } from './QuotedReply';
import { MediaPreview } from './MediaPreview';
import { MessageActionsSheet } from './MessageActionsSheet';
import { isStickerMime } from '../mime';
import { EmojiPicker } from './EmojiPicker';
import { formatMessageTime } from '../time';
import type { ChatMessage } from '@/types/chat';
import type { ChatScope } from '@/api/chat.service';

// Long-press tuning for the mobile action sheet.
const LONG_PRESS_MS = 450;
const MOVE_CANCEL_PX = 10;

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
  const { fromMe, body, hasMedia, mediaMimetype, quotedMessage, reactions, timestamp, senderName } = message;

  const handleEmojiPick = (emoji: string) => {
    onReact(message.id, emoji);
    setShowEmojiPicker(false);
  };

  // ------------------------------------------------------------------
  // Mobile long-press → action sheet (no hover on touch devices).
  // ------------------------------------------------------------------

  const isMobile = useIsMobile();
  const [actionsOpen, setActionsOpen] = useState(false);
  const longPressTimer = useRef<number | null>(null);
  const longPressFired = useRef(false);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);

  const clearLongPress = () => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  // Clear any pending timer on unmount.
  useEffect(() => {
    return () => {
      if (longPressTimer.current !== null) {
        window.clearTimeout(longPressTimer.current);
      }
    };
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isMobile) return;
    const touch = e.touches[0];
    if (!touch) return;
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    longPressFired.current = false;
    clearLongPress();
    longPressTimer.current = window.setTimeout(() => {
      longPressFired.current = true;
      setActionsOpen(true);
      navigator.vibrate?.(10);
    }, LONG_PRESS_MS);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const start = touchStartPos.current;
    const touch = e.touches[0];
    if (!start || !touch) return;
    // A finger drag past the threshold is a scroll, not a long press.
    if (
      Math.abs(touch.clientX - start.x) > MOVE_CANCEL_PX ||
      Math.abs(touch.clientY - start.y) > MOVE_CANCEL_PX
    ) {
      clearLongPress();
    }
  };

  const handleTouchEnd = () => {
    clearLongPress();
  };

  // Suppress the click the browser synthesises after a long-press (otherwise a
  // long-press on an image would also open the enlarge dialog).
  const handleClickCapture = (e: React.MouseEvent) => {
    if (longPressFired.current) {
      e.preventDefault();
      e.stopPropagation();
      longPressFired.current = false;
    }
  };

  // The browser fires `contextmenu` on long-press (Android); suppress it so our
  // own action sheet is the only thing that appears.
  const handleContextMenu = (e: React.MouseEvent) => {
    if (isMobile) e.preventDefault();
  };

  const handleSheetReply = () => {
    setActionsOpen(false);
    onReply(message);
  };

  const handleSheetReact = (emoji: string) => {
    setActionsOpen(false);
    onReact(message.id, emoji);
  };

  const handleSheetMoreEmojis = () => {
    setActionsOpen(false);
    setShowEmojiPicker(true);
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
      {/* Action buttons — desktop only (visible on hover). On mobile a
          long-press opens the action sheet instead (see below). */}
      <div
        className={[
          'hidden items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 md:flex',
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

      {/* Bubble — width hugs content (max ~75% of the pane), WhatsApp-style.
          Touch handlers drive the mobile long-press menu; select-none on mobile
          stops the long-press from selecting text / showing the iOS callout. */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onClickCapture={handleClickCapture}
        onContextMenu={handleContextMenu}
        className={[
          'flex w-fit max-w-[75%] flex-col gap-1 rounded-lg text-sm leading-snug select-none [-webkit-touch-callout:none] md:select-text',
          isStickerOnly
            ? 'bg-transparent p-0'
            : 'px-2.5 py-1.5 shadow-sm ' +
              (fromMe
                ? 'rounded-br-sm bg-primary text-primary-foreground'
                : 'rounded-bl-sm bg-muted text-foreground'),
        ].join(' ')}
      >
        {/* Sender name — only for incoming GROUP messages (WhatsApp-style). The
            worker leaves senderName null for 1:1 chats and outbound messages.
            A thin bottom rule separates the name from the message body. */}
        {!fromMe && senderName && (
          <p className="border-b border-primary/30 pb-1 text-xs font-semibold text-primary">
            {senderName}
          </p>
        )}

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

        {/* Timestamp — small, tight to the bubble bottom (WhatsApp-style). */}
        <p
          className={[
            '-mt-0.5 self-end text-[10px] leading-none',
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

      {/* Mobile long-press action sheet */}
      {isMobile && (
        <MessageActionsSheet
          open={actionsOpen}
          onOpenChange={setActionsOpen}
          onReply={handleSheetReply}
          onReact={handleSheetReact}
          onMoreEmojis={handleSheetMoreEmojis}
        />
      )}
    </div>
  );
};
