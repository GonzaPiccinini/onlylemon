/**
 * QuotedReply.tsx — Quoted message preview block.
 *
 * Used in two contexts:
 *   1. Inside a MessageItem to show the quoted message above the body.
 *   2. Inside the Composer to show the message being replied to, with an
 *      optional cancel button (via `onCancel` prop).
 *
 * When `previewText` is null (media message), renders a generic placeholder.
 */

import { XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { QuotedMessage } from '@/types/chat';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QuotedReplyProps {
  quoted: QuotedMessage;
  /** When provided, renders a cancel button (composer usage). */
  onCancel?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const QuotedReply = ({ quoted, onCancel }: QuotedReplyProps) => {
  const preview = quoted.previewText ?? '📷 Imagen';

  return (
    <div
      className={[
        'flex items-start gap-2 rounded-md border-l-4 bg-muted/60 px-3 py-2',
        quoted.fromMe ? 'border-l-primary' : 'border-l-muted-foreground',
      ].join(' ')}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-xs font-medium text-muted-foreground">
          {quoted.fromMe ? 'Tú' : 'Contacto'}
        </p>
        <p className="truncate text-xs text-foreground/80">{preview}</p>
      </div>

      {onCancel && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onCancel}
          aria-label="Cancelar respuesta"
          className="shrink-0"
        >
          <XIcon className="size-3.5" />
        </Button>
      )}
    </div>
  );
};
