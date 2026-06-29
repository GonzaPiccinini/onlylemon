/**
 * MediaPreview.tsx — Renders media for a chat message via the worker proxy.
 *
 * Behaviour:
 *   - Image mimetypes: thumbnail; clickable to enlarge via a Dialog.
 *   - PDF mimetype: a tile with a file icon + "Abrir PDF" link.
 *   - Loading: Skeleton placeholder.
 *   - View-once (410 / VIEW_ONCE_UNAVAILABLE): privacy placeholder. This is
 *     defense-in-depth — view-once messages are normally gated upstream in
 *     MessageItem so MediaPreview never mounts for them.
 *   - Null blob (404 / MEDIA_UNAVAILABLE): "media no disponible" placeholder.
 *   - isError (non-404 fetch failure): same "media no disponible" fallback.
 *
 * Uses `useMediaBlob` (which fetches through Axios Bearer auth) so the
 * worker's Authorization-only media route is reached correctly.
 */

import { useState } from 'react';
import { EyeOffIcon, FileTextIcon, ImageOffIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useMediaBlob } from '@/features/chat/hooks/useMediaBlob';
import { isStickerMime } from '../mime';
import type { ChatScope } from '@/api/chat.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MediaPreviewProps {
  scope: ChatScope;
  sessionId: string;
  chatId: string;
  messageId: string;
  mimetype: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isImageMime(mime: string | null): boolean {
  if (!mime) return false;
  return mime.startsWith('image/');
}

function isPdfMime(mime: string | null): boolean {
  return mime === 'application/pdf';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const UnavailablePlaceholder = () => (
  <div className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
    <ImageOffIcon className="size-4 shrink-0" />
    <span>Media no disponible</span>
  </div>
);

/**
 * View-once privacy placeholder — shown instead of media for "view once"
 * (visualización única) messages. Does NOT fetch any bytes. Mirrors WhatsApp's
 * wording.
 *
 * Accessibility: the visible text is read by screen readers in document order,
 * so no extra ARIA role is used — a live-region role (e.g. status) would announce
 * spuriously as bubbles mount while scrolling. The icon is decorative.
 */
export const ViewOncePlaceholder = () => (
  <div className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/40 px-3 py-2">
    <EyeOffIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    <div className="flex flex-col gap-0.5">
      <p className="text-xs font-medium text-foreground">Mensaje de visualización única</p>
      <p className="text-xs text-muted-foreground">Por privacidad, solo se puede abrir en el teléfono.</p>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const MediaPreview = ({
  scope,
  sessionId,
  chatId,
  messageId,
  mimetype,
}: MediaPreviewProps) => {
  const [enlargeOpen, setEnlargeOpen] = useState(false);

  const { objectUrl, isLoading, isError, isViewOnce } = useMediaBlob(
    scope,
    sessionId,
    chatId,
    messageId,
    /* enabled */ Boolean(mimetype),
  );

  if (isLoading) {
    return <Skeleton className="h-32 w-40 rounded-lg" />;
  }

  // 410 → view-once privacy placeholder (defense-in-depth; normally gated upstream)
  if (isViewOnce) {
    return <ViewOncePlaceholder />;
  }

  // 404 or non-404 error → unified placeholder (do NOT show a broken image)
  if (!objectUrl || isError) {
    return <UnavailablePlaceholder />;
  }

  // PDF tile
  if (isPdfMime(mimetype)) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
        <FileTextIcon className="size-5 shrink-0 text-muted-foreground" />
        <div className="flex flex-col gap-0.5">
          <p className="text-xs font-medium">Documento PDF</p>
          <a
            href={objectUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary underline-offset-2 hover:underline"
          >
            Abrir PDF
          </a>
        </div>
      </div>
    );
  }

  // Sticker — rendered plain (transparent, no crop, no enlarge dialog),
  // mimicking WhatsApp's sticker presentation.
  if (isStickerMime(mimetype)) {
    return (
      <img
        src={objectUrl}
        alt="Sticker"
        className="size-32 object-contain"
        draggable={false}
      />
    );
  }

  // Image (default for anything else that has objectUrl)
  if (isImageMime(mimetype)) {
    return (
      <>
        <button
          type="button"
          onClick={() => setEnlargeOpen(true)}
          className="block max-w-full self-start overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Ver imagen completa"
        >
          <img
            src={objectUrl}
            alt="Imagen adjunta"
            className="block h-auto max-h-64 w-auto max-w-full rounded-lg object-contain"
          />
        </button>

        <Dialog open={enlargeOpen} onOpenChange={setEnlargeOpen}>
          <DialogContent className="sm:max-w-2xl" showCloseButton>
            <DialogHeader>
              <DialogTitle>Imagen</DialogTitle>
            </DialogHeader>
            <div className="flex items-center justify-center">
              <img
                src={objectUrl}
                alt="Imagen adjunta"
                className="max-h-[70vh] max-w-full rounded-lg object-contain"
              />
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Unknown media type with a valid URL — render an unavailable placeholder
  return <UnavailablePlaceholder />;
};
