import { type ReactNode } from "react";
import { MessageCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import type { EmbedMode } from "./embed";

// ---------------------------------------------------------------------------
// EmbedPreview — a static, faithful MOCKUP of the embedded CTA component for
// each integration mode, shown above the copyable snippet so merchants can see
// what they are pasting before they paste it.
//
// IMPORTANT: this NEVER loads or executes the real embed script
// (`/embed/<id>.js`). That script calls the worker API + Altcha captcha and
// would create real leads. Everything here is inert, hand-built markup.
//
// Visual traits are lifted from the worker embed runtime
// (worker/src/modules/embed/bundle.ts):
//   - boton-flotante:    fixed round FAB, bottom-right (24px), 56px, WhatsApp
//                        green (#25d366), message-circle icon, white — opens
//                        WhatsApp directly (no modal).
//   - widget-automontado: a "Contactarse" button + an invisible captcha element
//                        injected into <div id="cta-root">.
//   - solo-logica:       the merchant's OWN [data-cta] button; the captcha is
//                        an invisible proof-of-work with no DOM container —
//                        the script only wires behavior (no injection).
// ---------------------------------------------------------------------------

/**
 * A mini browser window that frames the mockup so it unmistakably reads as "a
 * landing page". Chrome + canvas use centralized theme tokens only.
 */
function PageFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
      {/* Faux browser top bar: window dots + a neutral address pill. */}
      <div className="flex items-center gap-1.5 border-b border-border bg-muted/50 px-3 py-2">
        <span className="size-2 rounded-full bg-foreground/15" aria-hidden="true" />
        <span className="size-2 rounded-full bg-foreground/15" aria-hidden="true" />
        <span className="size-2 rounded-full bg-foreground/15" aria-hidden="true" />
        <span className="ml-2 h-3 flex-1 rounded-full bg-background/70" aria-hidden="true" />
      </div>

      {/* Page canvas — the merchant's site body. */}
      <div className="relative h-40 overflow-hidden bg-background p-4">{children}</div>
    </div>
  );
}

/** A few skeleton bars that suggest page content behind the CTA. */
function FauxContent() {
  return (
    <div className="space-y-2" aria-hidden="true">
      <div className="h-2.5 w-2/5 rounded-full bg-foreground/15" />
      <div className="h-1.5 w-4/5 rounded-full bg-foreground/8" />
      <div className="h-1.5 w-3/5 rounded-full bg-foreground/8" />
    </div>
  );
}

/**
 * Wraps the ACTUAL embedded element with a soft pulsing ring so the eye lands on
 * the real component immediately (vs the faux page chrome). The static ring is
 * always shown (and is the reduced-motion indicator); the ping halo only
 * animates when the user hasn't asked to reduce motion.
 */
function Highlight({
  children,
  round = false,
  className,
}: {
  children: ReactNode;
  round?: boolean;
  className?: string;
}) {
  const shape = round ? "rounded-full" : "rounded-lg";
  return (
    <div className={cn("relative w-fit", className)}>
      <span
        aria-hidden="true"
        className={cn("pointer-events-none absolute -inset-1 bg-primary/20 motion-safe:animate-ping", shape)}
      />
      <span
        aria-hidden="true"
        className={cn("pointer-events-none absolute -inset-1 ring-2 ring-primary/60", shape)}
      />
      <div className="relative">{children}</div>
    </div>
  );
}

/** Centers an in-flow mockup (widget / solo-logica) over the faux page so it
 *  can't overflow or hug the left edge of the canvas. */
function CanvasCenter({ children }: { children: ReactNode }) {
  return <div className="absolute inset-0 flex items-center justify-center p-4">{children}</div>;
}

/**
 * Static mockup of the embedded component for the selected integration mode.
 * Purely visual — see the module-level note on why the real script is never run.
 */
export function EmbedPreview({ mode }: { mode: EmbedMode }) {
  if (mode === "boton-flotante") {
    return (
      <PageFrame>
        <FauxContent />
        {/* FAB — faithful to the worker embed: fixed bottom-right, round, brand
            WhatsApp green via the --whatsapp token (real bundle bakes #25d366),
            white message-circle icon. Icon-only, like the real FAB. */}
        <div className="absolute bottom-3 right-3">
          <Highlight round>
            <div className="grid size-10 place-items-center rounded-full bg-whatsapp text-white shadow-lg shadow-black/30">
              <MessageCircle className="size-5" aria-hidden="true" />
            </div>
          </Highlight>
        </div>
      </PageFrame>
    );
  }

  if (mode === "widget-automontado") {
    return (
      <PageFrame>
        {/* Widget auto-mounted into <div id="cta-root">: the script appends a
            "Contactarse" button (plus an invisible captcha container — not shown,
            since nothing renders into it). The real button ships with a default
            WhatsApp-green style (class `.cta-btn`, still overridable), matching
            the brand green shown here. Centered so it never clips. */}
        <CanvasCenter>
          <div className="w-fit max-w-full space-y-2 rounded-lg border border-border bg-card/90 p-2.5 shadow-lg shadow-black/20">
            <span className="block font-mono text-[10px] leading-none text-muted-foreground/70">
              #cta-root
            </span>
            <Highlight>
              <span className="inline-flex items-center gap-1.5 rounded-md bg-whatsapp px-3 py-1.5 text-xs font-medium text-white shadow-sm">
                <MessageCircle className="size-3.5" aria-hidden="true" />
                Contactarse
              </span>
            </Highlight>
          </div>
        </CanvasCenter>
      </PageFrame>
    );
  }

  // solo-logica: the merchant supplies their own [data-cta] button. The
  // captcha is an invisible proof-of-work with no DOM container, so only the
  // button placeholder is shown here (dashed, neutral).
  return (
    <PageFrame>
      <CanvasCenter>
        <div className="w-fit max-w-full space-y-2">
          <div className="space-y-1">
            <span className="block font-mono text-[10px] leading-none text-muted-foreground/70">
              [data-cta]
            </span>
            <Highlight className="w-full">
              <span className="flex w-full items-center justify-center rounded-md border border-dashed border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground/80">
                Tu botón
              </span>
            </Highlight>
          </div>
        </div>
      </CanvasCenter>
    </PageFrame>
  );
}
