import { HelpCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { EMBED_MODE_INFO, type EmbedMode } from "./embed";
import { MODE_ICON } from "./embed-shared";

type EmbedModeHelpDialogProps = {
  mode: EmbedMode;
  onSelect: (mode: EmbedMode) => void;
};

/**
 * A "which one should I pick?" helper for non-technical users. Compares the
 * three modes in plain language; tapping a row selects it and closes the dialog.
 */
export function EmbedModeHelpDialog({ mode, onSelect }: EmbedModeHelpDialogProps) {
  return (
    <Dialog>
      <DialogTrigger
        render={<Button variant="ghost" size="sm" className="text-muted-foreground" />}
      >
        <HelpCircle data-icon="inline-start" />
        ¿Cuál me conviene?
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>¿Qué modo elijo?</DialogTitle>
          <DialogDescription>
            Tocá el que mejor se adapte a tu página. Podés cambiarlo cuando quieras.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {Object.values(EMBED_MODE_INFO).map((info) => {
            const Icon = MODE_ICON[info.value];
            const isActive = info.value === mode;
            return (
              <DialogClose
                key={info.value}
                render={
                  <button
                    type="button"
                    onClick={() => onSelect(info.value)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                      isActive
                        ? "border-primary/40 bg-primary/8"
                        : "border-foreground/8 hover:bg-muted/40",
                    )}
                  />
                }
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{info.label}</span>
                  </span>
                  <span className="block text-xs text-muted-foreground">{info.whatItDoes}</span>
                  <span className="block text-xs text-foreground/70">
                    <span className="text-muted-foreground">Ideal si:</span> {info.bestFor}
                  </span>
                </span>
              </DialogClose>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground">
          ¿Dudás? Elegí <span className="font-medium text-foreground">Botón flotante</span>: aparece
          solo en tu página y funciona en cualquier lado.
        </p>
      </DialogContent>
    </Dialog>
  );
}
