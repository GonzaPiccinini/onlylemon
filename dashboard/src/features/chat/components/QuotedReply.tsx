/**
 * QuotedReply.tsx — Quoted message preview block.
 *
 * Used in two contexts:
 *   1. Inside a MessageItem to show the quoted message above the body. When
 *      `onJump` is provided the whole block is a button that scrolls to (and
 *      flashes) the original message.
 *   2. Inside the Composer to show the message being replied to, with an
 *      optional cancel button (via `onCancel`).
 *
 * Author label: "Vos" for your own messages, otherwise the chat contact's name
 * (passed via `contactName`) — falls back to "Contacto" only when unknown. The
 * accent bar + author colour mirror the quoted side: primary for you, green for
 * the contact.
 *
 * When `previewText` is null (media message), renders a generic placeholder.
 */

import { XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { QuotedMessage } from '@/types/chat';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QuotedReplyProps {
  quoted: QuotedMessage;
  /** Chat contact's display name — shown when the quoted message is theirs. */
  contactName?: string;
  /** Thread usage: makes the block a button that jumps to the original message. */
  onJump?: () => void;
  /** Composer usage: renders a cancel button. */
  onCancel?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const QuotedReply = ({ quoted, contactName, onJump, onCancel }: QuotedReplyProps) => {
  const isMine = quoted.fromMe;
  const author = isMine ? 'Vos' : contactName?.trim() || 'Contacto';
  const preview = quoted.previewText ?? '📷 Foto';

  // Accent bar — full height; primary for your messages, green for theirs.
  const bar = (
    <span
      aria-hidden
      className={cn('w-1 shrink-0', isMine ? 'bg-primary' : 'bg-success')}
    />
  );

  const content = (
    <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 py-1.5 pr-1">
      <p
        className={cn(
          'truncate text-xs font-semibold',
          isMine ? 'text-primary' : 'text-success',
        )}
      >
        {author}
      </p>
      <p className="truncate text-xs text-muted-foreground">{preview}</p>
    </div>
  );

  // Thread usage — the whole block jumps to the quoted message.
  if (onJump) {
    return (
      <button
        type="button"
        onClick={onJump}
        title="Ir al mensaje original"
        className="flex w-full items-stretch gap-2 overflow-hidden rounded-md bg-black/10 text-left transition-colors hover:bg-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {bar}
        {content}
      </button>
    );
  }

  // Composer usage (or static) — plain block with an optional cancel button.
  return (
    <div className="flex items-stretch gap-2 overflow-hidden rounded-md bg-black/10">
      {bar}
      {content}
      {onCancel && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onCancel}
          aria-label="Cancelar respuesta"
          className="m-1 shrink-0 self-center"
        >
          <XIcon className="size-3.5" />
        </Button>
      )}
    </div>
  );
};
