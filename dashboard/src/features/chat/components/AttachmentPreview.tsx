/**
 * AttachmentPreview.tsx — Shows a thumbnail of a selected image attachment.
 *
 * Creates an object URL via `URL.createObjectURL` (memoized on the file
 * reference so it is stable) and revokes it on unmount / file-change to
 * avoid memory leaks.
 *
 * The URL is derived synchronously from the File prop rather than being set
 * via setState in an effect, which avoids the react-hooks/set-state-in-effect
 * and react-hooks/refs lint rules.
 */

import { useEffect, useMemo } from 'react';
import { XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AttachmentPreviewProps {
  file: File;
  onRemove: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const AttachmentPreview = ({ file, onRemove }: AttachmentPreviewProps) => {
  // Create the object URL synchronously — memoized so it's stable per file.
  const objectUrl = useMemo(() => URL.createObjectURL(file), [file]);

  // Revoke when the URL changes (new file) or when the component unmounts.
  // The effect captures `objectUrl` via closure; the returned cleanup revokes
  // the exact URL that was created in this particular render cycle.
  useEffect(() => {
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  return (
    <div className="relative inline-flex shrink-0">
      <img
        src={objectUrl}
        alt={file.name}
        className="h-20 w-20 rounded-lg border object-cover"
      />

      <Button
        type="button"
        variant="destructive"
        size="icon-sm"
        onClick={onRemove}
        aria-label="Eliminar archivo adjunto"
        className="absolute -right-2 -top-2 size-5 rounded-full p-0"
      >
        <XIcon className="size-3" />
      </Button>
    </div>
  );
};
