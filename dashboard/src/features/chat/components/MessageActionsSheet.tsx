/**
 * MessageActionsSheet.tsx — Mobile long-press action menu (WhatsApp-style).
 *
 * On touch devices the hover reply/react buttons are hidden (no hover), so a
 * long-press on a message bubble opens this bottom sheet instead. It offers a
 * row of quick emoji reactions (+ "more emojis" to open the full picker) and a
 * "Responder" action.
 *
 * Built on the Base UI Dialog primitive (like components/ui/sheet.tsx) but
 * anchored to the bottom and sliding up. Portaled to <body>, so it escapes the
 * mobile conversation overlay's stacking context.
 */

import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { PlusIcon, ReplyIcon } from 'lucide-react';

// Quick reactions surfaced first, matching WhatsApp's default set.
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

interface MessageActionsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Reply to the message. */
  onReply: () => void;
  /** React with the given emoji. */
  onReact: (emoji: string) => void;
  /** Open the full emoji picker for a reaction. */
  onMoreEmojis: () => void;
}

export const MessageActionsSheet = ({
  open,
  onOpenChange,
  onReply,
  onReact,
  onMoreEmojis,
}: MessageActionsSheetProps) => {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/40 duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Popup className="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-2 rounded-t-2xl bg-popover p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none duration-200 data-open:animate-in data-open:slide-in-from-bottom data-closed:animate-out data-closed:slide-out-to-bottom">
          <DialogPrimitive.Title className="sr-only">
            Acciones del mensaje
          </DialogPrimitive.Title>

          {/* Quick reaction row */}
          <div className="flex items-center justify-between gap-1">
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onReact(emoji)}
                aria-label={`Reaccionar con ${emoji}`}
                className="flex size-11 items-center justify-center rounded-full text-2xl transition-colors hover:bg-accent active:bg-accent"
              >
                {emoji}
              </button>
            ))}
            <button
              type="button"
              onClick={onMoreEmojis}
              aria-label="Más emojis"
              className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-accent active:bg-accent"
            >
              <PlusIcon className="size-5" />
            </button>
          </div>

          <div className="-mx-1 my-1 h-px bg-border" />

          {/* Reply action */}
          <button
            type="button"
            onClick={onReply}
            className="flex items-center gap-3 rounded-lg px-2 py-3 text-left text-sm transition-colors hover:bg-accent active:bg-accent"
          >
            <ReplyIcon className="size-5 text-muted-foreground" />
            Responder
          </button>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};
