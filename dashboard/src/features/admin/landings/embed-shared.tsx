import { AppWindow, Code2, MessageCircle, type LucideIcon } from "lucide-react";

import { type EmbedMode } from "./embed";

// ---------------------------------------------------------------------------
// Shared atoms for the integration ("Integración") panel — kept in one place so
// the intro card, the "¿cuál me conviene?" dialog, and the install guide render
// modes and steps identically.
// ---------------------------------------------------------------------------

/** Icon per mode. Mirrors the embed preview (WhatsApp bubble for the FAB). */
// eslint-disable-next-line react-refresh/only-export-components -- icon map shared with sibling panels
export const MODE_ICON: Record<EmbedMode, LucideIcon> = {
  "boton-flotante": MessageCircle,
  "widget-automontado": AppWindow,
  "solo-logica": Code2,
};

/** A friendly, plain-language ordered list with circular step numbers. */
export function NumberedSteps({ steps }: { steps: string[] }) {
  return (
    <ol className="flex flex-col gap-2">
      {steps.map((step, index) => (
        <li key={step} className="flex gap-2.5">
          <span
            aria-hidden="true"
            className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary"
          >
            {index + 1}
          </span>
          <span className="text-sm text-muted-foreground">{step}</span>
        </li>
      ))}
    </ol>
  );
}
