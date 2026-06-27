/**
 * MessageItem.tsx — Renders a single chat message bubble.
 *
 * Features:
 *   - Left-aligned (inbound) vs right-aligned (outbound/fromMe).
 *   - Outbound bubbles use a soft primary tint (not a saturated fill) so long
 *     threads stay legible.
 *   - Consecutive messages from the same side are grouped: the first gets extra
 *     top spacing, only the last gets the bubble "tail" corner.
 *   - `quotedMessage` → QuotedReply preview block above the body.
 *   - `hasMedia` → MediaPreview block.
 *   - `reactions` → rounded chips tucked under the bubble's sender edge.
 *   - Hover actions (desktop): reply + react buttons FLOAT beside the bubble so
 *     they reserve no vertical space in the thread. Mobile uses a long-press
 *     action sheet instead.
 *   - Timestamp is inline at the bubble's bottom-right (WhatsApp-style).
 *
 * `onReply` and `onReact` are passed from MessageThread so the actions
 * propagate up through the component tree without direct API calls here.
 */

import { useEffect, useRef, useState } from 'react';
import { ReplyIcon, SmilePlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
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
  /** Chat contact's display name — used to label quoted replies from them. */
  contactName?: string;
  /** Scrolls to + highlights the message with the given id (quote tap). */
  onJumpToMessage?: (messageId: string) => void;
  /** First message of a same-side run → extra top spacing. */
  isFirstInGroup: boolean;
  /** Last message of a same-side run → render the bubble tail corner. */
  isLastInGroup: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Collapse the reaction list into unique emojis with a count. */
function groupReactions(reactions: ChatMessage['reactions']) {
  const map = new Map<string, { emoji: string; count: number; mine: boolean }>();
  for (const r of reactions) {
    const cur = map.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false };
    cur.count += 1;
    cur.mine = cur.mine || r.fromMe;
    map.set(r.emoji, cur);
  }
  return [...map.values()];
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
  contactName,
  onJumpToMessage,
  isFirstInGroup,
  isLastInGroup,
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
  const groupedReactions = groupReactions(reactions);

  return (
    <div
      className={cn(
        'group flex flex-col',
        fromMe ? 'items-end' : 'items-start',
        isFirstInGroup ? 'mt-2' : 'mt-0.5',
      )}
    >
      {/* Anchor sized to the bubble so the hover actions can float just outside
          it without reserving any vertical space in the thread. */}
      <div className="relative w-fit max-w-[75%]">
        {/* Hover actions — desktop only. Float beside the bubble (opposite the
            sender side) and fade in on hover; mobile uses the long-press sheet. */}
        <div
          className={cn(
            'absolute top-1/2 z-10 hidden -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 md:flex',
            fromMe ? 'right-full mr-1 flex-row-reverse' : 'left-full ml-1',
          )}
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

        {/* Bubble. Touch handlers drive the mobile long-press menu; select-none
            on mobile stops the long-press from selecting text / iOS callout. */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          onClickCapture={handleClickCapture}
          onContextMenu={handleContextMenu}
          data-mid={message.id}
          className={cn(
            'flex w-fit max-w-full flex-col gap-1 text-sm leading-snug select-none [-webkit-touch-callout:none] md:select-text',
            isStickerOnly
              ? 'bg-transparent p-0'
              : cn(
                  'rounded-2xl px-2.5 py-1.5 shadow-sm',
                  fromMe ? 'bg-primary/15 text-foreground' : 'bg-muted text-foreground',
                  isLastInGroup && (fromMe ? 'rounded-br-sm' : 'rounded-bl-sm'),
                ),
          )}
        >
          {/* Sender name — only for incoming GROUP messages (WhatsApp-style). The
              worker leaves senderName null for 1:1 chats and outbound messages. */}
          {!fromMe && senderName && (
            <p className="border-b border-primary/30 pb-1 text-xs font-semibold text-primary">
              {senderName}
            </p>
          )}

          {/* Quoted reply preview — tap to jump to the original message. */}
          {quotedMessage && (
            <QuotedReply
              quoted={quotedMessage}
              contactName={contactName}
              onJump={
                onJumpToMessage
                  ? () => onJumpToMessage(quotedMessage.id)
                  : undefined
              }
            />
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

          {/* Text body + inline timestamp. The time tucks to the bottom-right of
              the last line; for long text it drops to its own right-aligned row. */}
          <div className="flex flex-wrap items-end justify-end gap-x-2 gap-y-0.5">
            {body && (
              <p className="min-w-0 whitespace-pre-wrap break-words text-left">{body}</p>
            )}
            <span className="shrink-0 translate-y-px text-[10px] leading-none text-muted-foreground">
              {formatMessageTime(timestamp)}
            </span>
          </div>
        </div>

        {/* Reactions — rounded chips tucked under the bubble's sender edge. */}
        {groupedReactions.length > 0 && (
          <div
            className={cn(
              'relative z-10 -mt-1 flex flex-wrap gap-1',
              fromMe ? 'justify-end pr-1' : 'justify-start pl-1',
            )}
          >
            {groupedReactions.map((r) => (
              <span
                key={r.emoji}
                title={r.mine ? 'Vos reaccionaste' : 'Reacción recibida'}
                className="inline-flex select-none items-center gap-0.5 rounded-full bg-card px-1.5 py-0.5 leading-none shadow-sm ring-1 ring-border"
              >
                <span className="text-sm leading-none">{r.emoji}</span>
                {r.count > 1 && (
                  <span className="text-[10px] text-muted-foreground">{r.count}</span>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

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
