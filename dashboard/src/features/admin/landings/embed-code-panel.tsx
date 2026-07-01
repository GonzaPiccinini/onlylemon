import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CodeBlock } from "@/components/ui/code-block";
import type { Landing } from "@/types/domain";
import { EmbedPreview } from "./embed-preview";
import { buildSnippet, EMBED_MODE_HINT, EMBED_MODES, type EmbedMode } from "./embed";

type EmbedCodePanelProps = {
  landing: Landing;
  mode: EmbedMode;
  onModeChange: (mode: EmbedMode) => void;
};

/**
 * The signature panel: pick an integration mode via a segmented control, read
 * the snippet on a subtle, line-numbered, syntax-highlighted surface that
 * blends with the UI, and copy it.
 */
export const EmbedCodePanel = ({ landing, mode, onModeChange }: EmbedCodePanelProps) => {
  const snippet = buildSnippet(landing.id, mode);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Modo de integración</span>
        <ToggleGroup
          value={mode}
          onValueChange={(next) => onModeChange(next as EmbedMode)}
          className="w-fit"
        >
          {EMBED_MODES.map((m) => (
            <ToggleGroupItem key={m.value} value={m.value} className="h-7 px-3 bg-transparent">
              {m.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Vista previa</span>
        <EmbedPreview mode={mode} />
      </div>

      <CodeBlock code={snippet} copyLabel="Copiar snippet de integración" />

      <p className="text-sm text-muted-foreground">{EMBED_MODE_HINT[mode]}</p>

      {mode === "solo-logica" && (
        <div className="rounded-lg border border-foreground/8 bg-muted/30 p-3 text-xs text-muted-foreground">
          Tu página debe incluir un elemento con el atributo{" "}
          <code className="rounded bg-muted px-1 font-mono text-foreground">data-cta</code> (el botón
          que dispara el contacto) y un contenedor con el atributo{" "}
          <code className="rounded bg-muted px-1 font-mono text-foreground">data-cta-captcha</code>{" "}
          (donde se muestra el captcha). El snippet incluye un ejemplo.
        </div>
      )}
    </div>
  );
};
