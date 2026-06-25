/**
 * Composer.tsx — Chat message input area.
 *
 * Capabilities:
 *   - Text input (shadcn Textarea), Enter-to-send, Shift+Enter for newline.
 *   - Attach button: opens a file picker (image/jpeg, image/png, image/webp).
 *   - AttachmentPreview tile shown while an image is staged.
 *   - Reply mode: renders QuotedReply above the input; cancelled via onCancel.
 *   - CRITICAL (spec amendment): when a file attachment is present, reply mode
 *     is HIDDEN — photo send has no replyTo in V1.
 *   - Client-side guard: rejects files > 5 MB or wrong MIME before upload.
 *   - Send button disabled while `sending` is true.
 */

import { useRef, useState, type KeyboardEvent } from 'react';
import { PaperclipIcon, SendIcon, SmileIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { QuotedReply } from './QuotedReply';
import { AttachmentPreview } from './AttachmentPreview';
import { EmojiPicker } from './EmojiPicker';
import type { ChatMessage } from '@/types/chat';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ComposerProps {
  onSendText: (text: string, replyTo?: string) => void;
  onSendPhoto: (file: File, caption?: string) => void;
  /** Called on each keystroke to drive the real-time typing indicator. */
  onTyping?: () => void;
  replyingTo?: ChatMessage | null;
  onCancelReply: () => void;
  sending: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validateFile(file: File): string | null {
  if (!ALLOWED_MIMES.has(file.type)) {
    return `Tipo de archivo no soportado: ${file.type}. Usá JPEG, PNG o WebP.`;
  }
  if (file.size > MAX_FILE_BYTES) {
    return 'El archivo supera el límite de 5 MB.';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Composer = ({
  onSendText,
  onSendPhoto,
  onTyping,
  replyingTo,
  onCancelReply,
  sending,
}: ComposerProps) => {
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /**
   * Inserts the picked emoji at the current caret position (or appends it),
   * keeping focus in the textarea so the user can keep typing.
   */
  const handleEmojiPick = (emoji: string) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    setShowEmojiPicker(false);
    // Restore focus + caret just after the inserted emoji on the next frame.
    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (!node) return;
      node.focus();
      const caret = start + emoji.length;
      node.setSelectionRange(caret, caret);
    });
  };

  // CRITICAL: when an attachment is present, reply mode must be suppressed.
  // Photo send has no replyTo in V1 (spec amendment).
  const effectiveReplyingTo = attachment ? null : replyingTo;

  const canSend = !sending && (text.trim().length > 0 || attachment !== null);

  const handleSend = () => {
    if (!canSend) return;

    if (attachment) {
      // Photo path — caption is the text (if any), no replyTo
      onSendPhoto(attachment, text.trim() || undefined);
      setAttachment(null);
      setText('');
    } else {
      // Text path — include replyTo from effectiveReplyingTo
      onSendText(text.trim(), effectiveReplyingTo?.id);
      setText('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const error = validateFile(file);
    if (error) {
      toast.error(error);
      // Reset input so the same file can be re-selected after the error
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setAttachment(file);
    // Reset input value so the user can re-select the same file after removing
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveAttachment = () => {
    setAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="flex flex-col gap-2 border-t bg-black p-3">
      {/* Reply preview — hidden when an attachment is staged */}
      {effectiveReplyingTo && (
        <QuotedReply
          quoted={{
            id: effectiveReplyingTo.id,
            previewText: effectiveReplyingTo.body || null,
            fromMe: effectiveReplyingTo.fromMe,
          }}
          onCancel={onCancelReply}
        />
      )}

      {/* Attachment preview */}
      {attachment && (
        <AttachmentPreview file={attachment} onRemove={handleRemoveAttachment} />
      )}

      {/* Input row — buttons vertically centered with the input bar. */}
      <div className="flex items-center gap-2">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileChange}
          aria-label="Adjuntar imagen"
        />

        {/* Attach button */}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={sending}
          aria-label="Adjuntar imagen"
          title="Adjuntar imagen"
          className="shrink-0"
        >
          <PaperclipIcon className="size-4" />
        </Button>

        {/* Text input with the emoji button inside the bar (left), WhatsApp
            style. Grows up to ~5 lines, then scrolls inside. */}
        <div className="relative flex-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setShowEmojiPicker(true)}
            disabled={sending}
            aria-label="Insertar emoji"
            title="Insertar emoji"
            className="absolute bottom-1 left-1 z-10"
          >
            <SmileIcon className="size-4" />
          </Button>
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              onTyping?.();
            }}
            onKeyDown={handleKeyDown}
            placeholder={attachment ? 'Añadí un pie de foto (opcional)…' : 'Escribí un mensaje…'}
            disabled={sending}
            rows={1}
            className="scrollbar-thin min-h-0 max-h-[7.5rem] w-full resize-none overflow-y-auto py-2 pl-10"
          />
        </div>

        {/* Send button */}
        <Button
          type="button"
          size="icon-sm"
          onClick={handleSend}
          disabled={!canSend}
          aria-label="Enviar"
          title="Enviar"
          className="shrink-0"
        >
          <SendIcon className="size-4" />
        </Button>
      </div>

      {/* Emoji picker — inserts into the message at the caret. */}
      {showEmojiPicker && (
        <EmojiPicker
          onPick={handleEmojiPick}
          onClose={() => setShowEmojiPicker(false)}
        />
      )}
    </div>
  );
};
