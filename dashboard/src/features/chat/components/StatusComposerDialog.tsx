/**
 * StatusComposerDialog.tsx — Publish a WhatsApp status (story) from a session.
 *
 * Two modes (shadcn Tabs):
 *   - Texto:  textarea (700 chars max, WAHA/WhatsApp cap) + background color
 *             swatches forwarded as `backgroundColor`.
 *   - Imagen: file picker (same 5 MB / JPEG-PNG-WebP rules as the chat
 *             composer) + optional caption.
 *
 * Statuses are fire-and-forget: WAHA has no status-viewing API, so success is
 * only signalled via toast (handled in usePublishStatus) and the dialog closes.
 */

import { useRef, useState } from 'react';
import { ImagePlusIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { usePublishStatus } from '../hooks/usePublishStatus';
import { AttachmentPreview } from './AttachmentPreview';
import type { ChatScope } from '@/api/chat.service';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_TEXT_LENGTH = 700;
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** WhatsApp-style background palette for text statuses. */
const BACKGROUND_COLORS = [
  '#075e54',
  '#128c7e',
  '#25d366',
  '#34b7f1',
  '#5851d8',
  '#d32f2f',
  '#f57c00',
  '#7b1fa2',
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StatusComposerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: ChatScope;
  sessionId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const StatusComposerDialog = ({
  open,
  onOpenChange,
  scope,
  sessionId,
}: StatusComposerDialogProps) => {
  const { publishText, publishImage } = usePublishStatus(scope, sessionId);

  const [text, setText] = useState('');
  const [backgroundColor, setBackgroundColor] = useState(BACKGROUND_COLORS[0]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const publishing = publishText.isPending || publishImage.isPending;

  const resetAndClose = () => {
    setText('');
    setBackgroundColor(BACKGROUND_COLORS[0]);
    setImageFile(null);
    setCaption('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    onOpenChange(false);
  };

  const handlePublishText = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    publishText.mutate(
      { text: trimmed, backgroundColor },
      { onSuccess: resetAndClose },
    );
  };

  const handlePublishImage = () => {
    if (!imageFile) return;
    publishImage.mutate(
      { file: imageFile, caption: caption.trim() || undefined },
      { onSuccess: resetAndClose },
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_MIMES.has(file.type)) {
      toast.error(`Tipo de archivo no soportado: ${file.type}. Usá JPEG, PNG o WebP.`);
    } else if (file.size > MAX_FILE_BYTES) {
      toast.error('El archivo supera el límite de 5 MB.');
    } else {
      setImageFile(file);
    }
    // Reset so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !publishing && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>Publicar estado</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="text">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="text">Texto</TabsTrigger>
            <TabsTrigger value="image">Imagen</TabsTrigger>
          </TabsList>

          {/* ── Text status ── */}
          <TabsContent value="text" className="flex flex-col gap-3 pt-2">
            {/* Live preview mimicking the WhatsApp text status card */}
            <div
              className="flex min-h-32 items-center justify-center rounded-xl p-4"
              style={{ backgroundColor }}
            >
              <p className="max-h-40 overflow-hidden whitespace-pre-wrap break-words text-center text-lg font-medium text-white">
                {text || 'Escribí tu estado…'}
              </p>
            </div>

            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT_LENGTH))}
              placeholder="Escribí tu estado…"
              disabled={publishing}
              rows={3}
              className="resize-none"
            />
            <p className="self-end text-xs text-muted-foreground">
              {text.length}/{MAX_TEXT_LENGTH}
            </p>

            {/* Background color swatches */}
            <div className="flex flex-wrap items-center gap-2">
              {BACKGROUND_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setBackgroundColor(color)}
                  aria-label={`Color de fondo ${color}`}
                  className={[
                    'size-7 rounded-full transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    backgroundColor === color
                      ? 'scale-110 ring-2 ring-ring ring-offset-2'
                      : 'hover:scale-105',
                  ].join(' ')}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>

            <Button
              type="button"
              onClick={handlePublishText}
              disabled={publishing || text.trim().length === 0}
            >
              {publishText.isPending ? 'Publicando…' : 'Publicar estado'}
            </Button>
          </TabsContent>

          {/* ── Image status ── */}
          <TabsContent value="image" className="flex flex-col gap-3 pt-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileChange}
              aria-label="Elegir imagen para el estado"
            />

            {imageFile ? (
              <AttachmentPreview
                file={imageFile}
                onRemove={() => setImageFile(null)}
              />
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={publishing}
                className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ImagePlusIcon className="size-6" />
                <span>Elegir imagen (JPEG, PNG o WebP, máx. 5 MB)</span>
              </button>
            )}

            <Textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Pie de foto (opcional)…"
              disabled={publishing}
              rows={2}
              className="resize-none"
            />

            <Button
              type="button"
              onClick={handlePublishImage}
              disabled={publishing || imageFile === null}
            >
              {publishImage.isPending ? 'Publicando…' : 'Publicar estado'}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
