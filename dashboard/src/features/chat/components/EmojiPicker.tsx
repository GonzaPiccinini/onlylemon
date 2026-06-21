/**
 * EmojiPicker.tsx — Lazy-loaded emoji-mart picker wrapped in a Dialog.
 *
 * emoji-mart + @emoji-mart/data + @emoji-mart/react are loaded via
 * `React.lazy` + dynamic `import()` so they land in a separate bundle chunk
 * and don't inflate the main bundle.
 *
 * A spinner is shown while the lazy chunk loads.
 *
 * Props:
 *   onPick(emoji: string) — called with the native emoji string when user picks.
 *   onClose()             — called when the dialog is closed without picking.
 */

import { lazy, Suspense, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// ---------------------------------------------------------------------------
// Lazy chunk for emoji-mart
// ---------------------------------------------------------------------------

// We need to lazy-load @emoji-mart/react's Picker and @emoji-mart/data together.
// Using React.lazy wraps the default-export component.
const LazyPicker = lazy(async () => {
  // Import picker + data in parallel; both end up in the same async chunk.
  const [pickerModule, dataModule] = await Promise.all([
    import('@emoji-mart/react'),
    import('@emoji-mart/data'),
  ]);
  const { default: Picker } = pickerModule;
  const { default: data } = dataModule;

  // Wrap so we can pass `data` without the consumer knowing about it.
  const PickerWithData = ({ onEmojiSelect }: { onEmojiSelect: (e: { native: string }) => void }) => (
    <Picker data={data} onEmojiSelect={onEmojiSelect} locale="es" theme="auto" />
  );
  return { default: PickerWithData };
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EmojiPickerProps {
  onPick: (emoji: string) => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const EmojiPicker = ({ onPick, onClose }: EmojiPickerProps) => {
  const [open, setOpen] = useState(true);

  // Sync external close
  useEffect(() => {
    if (!open) onClose();
  }, [open, onClose]);

  const handlePick = (e: { native: string }) => {
    onPick(e.native);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="w-fit p-4 sm:max-w-fit" showCloseButton>
        <DialogHeader>
          <DialogTitle className="sr-only">Elegir emoji</DialogTitle>
        </DialogHeader>
        <Suspense
          fallback={
            <div className="flex h-32 w-64 items-center justify-center text-sm text-muted-foreground">
              Cargando emojis…
            </div>
          }
        >
          <LazyPicker onEmojiSelect={handlePick} />
        </Suspense>
      </DialogContent>
    </Dialog>
  );
};
