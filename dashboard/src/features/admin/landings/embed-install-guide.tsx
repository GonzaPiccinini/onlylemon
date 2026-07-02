import { type ReactNode } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { type EmbedMode } from "./embed";
import { PLATFORM_GUIDES, type PlatformGuide } from "./embed-install";
import { NumberedSteps } from "./embed-shared";

/** Inline monospace token, matching the code styling used across the panel. */
function Mono({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-muted px-1 font-mono text-[0.85em] text-foreground">{children}</code>
  );
}

/**
 * Mode-specific "what you actually need to do" note, so nobody hits a dead end:
 * the FAB is drop-in, the widget must be placed where the button should appear,
 * and solo-logica needs the merchant's own markup.
 */
function ModeRequirement({ mode }: { mode: EmbedMode }) {
  if (mode === "boton-flotante") {
    return (
      <Alert>
        <AlertDescription>
          No hace falta nada más: pegás el código una sola vez y el botón de WhatsApp aparece solo en
          tu página.
        </AlertDescription>
      </Alert>
    );
  }

  if (mode === "widget-automontado") {
    return (
      <Alert>
        <AlertTitle>Dónde aparece el botón</AlertTitle>
        <AlertDescription>
          Pegá el código en el lugar exacto de tu página donde querés que aparezca el botón
          «Contactarse» —normalmente con un bloque de «HTML» o «Código» de tu editor—. Si lo pegás en
          el pie de página, el botón aparecerá al final.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert>
      <AlertTitle>Qué necesita tu página</AlertTitle>
      <AlertDescription>
        Tu página debe incluir un elemento con el atributo <Mono>data-cta</Mono> (el botón que dispara
        el contacto) y un contenedor con el atributo <Mono>data-cta-captcha</Mono> (donde se muestra el
        captcha). El código de arriba ya incluye un ejemplo listo para pegar antes de{" "}
        <Mono>&lt;/body&gt;</Mono>.
      </AlertDescription>
    </Alert>
  );
}

/** A single collapsible platform guide, built on the native <details> element. */
function PlatformAccordion({ guide }: { guide: PlatformGuide }) {
  return (
    <details className="group glass-subtle rounded-lg border border-foreground/8 open:bg-muted/20">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-medium marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <span className="flex-1">{guide.name}</span>
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>

      <div className="flex flex-col gap-3 border-t border-foreground/8 px-3 py-3">
        <NumberedSteps steps={guide.steps} />

        {guide.note && (
          <p className="rounded-md bg-muted/40 px-2.5 py-2 text-xs text-muted-foreground">
            {guide.note}
          </p>
        )}

        {guide.sourceUrl && (
          <a
            href={guide.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Ver la ayuda oficial de {guide.name}
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        )}
      </div>
    </details>
  );
}

/**
 * The "¿Cómo lo instalo?" section: a mode-specific requirement note plus a
 * collapsible, step-by-step guide for each common no-code platform.
 */
export function EmbedInstallGuide({ mode }: { mode: EmbedMode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">¿Cómo lo instalo?</h3>

      <ModeRequirement mode={mode} />

      <p className="text-sm text-muted-foreground">
        Ya copiaste el código con el botón de arriba. Elegí dónde tenés hecha tu página y seguí los
        pasos:
      </p>

      <div className="flex flex-col gap-2">
        {PLATFORM_GUIDES.map((guide) => (
          <PlatformAccordion key={guide.id} guide={guide} />
        ))}
      </div>
    </section>
  );
}
