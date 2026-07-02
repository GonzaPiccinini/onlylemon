import { ShieldCheck } from "lucide-react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CodeBlock } from "@/components/ui/code-block";
import type { Landing } from "@/types/domain";
import { EmbedPreview } from "./embed-preview";
import { buildSnippetBlocks, EMBED_MODE_INFO, EMBED_MODES, type EmbedMode } from "./embed";
import { MODE_ICON } from "./embed-shared";
import { EmbedModeHelpDialog } from "./embed-mode-help-dialog";
import { EmbedInstallGuide } from "./embed-install-guide";
import { MODE_EXAMPLE } from "./embed-install";
import { HighlightedSnippet } from "./highlighted-snippet";

type EmbedCodePanelProps = {
  landing: Landing;
  mode: EmbedMode;
  onModeChange: (mode: EmbedMode) => void;
};

/** At-a-glance card describing the picked mode in plain language. */
function ModeIntroCard({ mode }: { mode: EmbedMode }) {
  const info = EMBED_MODE_INFO[mode];
  const Icon = MODE_ICON[mode];

  return (
    <div className="glass-subtle flex items-start gap-3 rounded-lg border border-foreground/8 p-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-heading text-sm font-semibold">{info.label}</span>
          <span className="text-xs text-muted-foreground">· {info.tagline}</span>
        </div>
        <p className="text-sm text-muted-foreground">{info.whatItDoes}</p>
      </div>
    </div>
  );
}

/** Cross-cutting trust signal: every mode ships with the invisible captcha. */
function SecurityFeature() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/8 p-3">
      <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
      <div className="space-y-0.5">
        <p className="text-sm font-medium">Protección anti-spam incluida</p>
        <p className="text-sm text-muted-foreground">
          Todos los botones incluyen un captcha invisible que filtra bots automáticamente. Tus
          visitantes no ven nada ni tienen que resolver nada.
        </p>
      </div>
    </div>
  );
}

/**
 * The signature panel: pick an integration mode via a segmented control, learn
 * what it does in plain language, preview it, copy the snippet, and follow a
 * step-by-step install guide in plain, jargon-free language.
 */
export const EmbedCodePanel = ({ landing, mode, onModeChange }: EmbedCodePanelProps) => {
  const blocks = buildSnippetBlocks(landing.id, mode);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Modo de integración</span>
          <EmbedModeHelpDialog mode={mode} onSelect={onModeChange} />
        </div>
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

      <ModeIntroCard mode={mode} />

      <SecurityFeature />

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Vista previa</span>
        <EmbedPreview mode={mode} />
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-sm font-medium">Tu código</span>
        {blocks.map((block, index) => (
          <div key={block.label ?? `block-${index}`} className="flex flex-col gap-1.5">
            {block.label && (
              <span className="text-xs text-muted-foreground">{block.label}</span>
            )}
            <CodeBlock code={block.code} copyLabel="Copiar código" />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Cómo se aplica</span>
        <HighlightedSnippet example={MODE_EXAMPLE[mode]} />
      </div>

      <EmbedInstallGuide mode={mode} onModeChange={onModeChange} />
    </div>
  );
};
