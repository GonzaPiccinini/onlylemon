import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CodeBlock } from "@/components/ui/code-block";
import type { Landing } from "@/types/domain";
import { EmbedPreview } from "./embed-preview";
import { buildSnippet, EMBED_MODE_INFO, EMBED_MODES, type EmbedMode } from "./embed";
import { DifficultyBadge, MODE_ICON } from "./embed-shared";
import { EmbedModeHelpDialog } from "./embed-mode-help-dialog";
import { EmbedInstallGuide } from "./embed-install-guide";

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
          <DifficultyBadge difficulty={info.difficulty} className="ml-auto" />
        </div>
        <p className="text-sm text-muted-foreground">{info.whatItDoes}</p>
      </div>
    </div>
  );
}

/**
 * The signature panel: pick an integration mode via a segmented control, learn
 * what it does in plain language, preview it, copy the snippet, and follow a
 * step-by-step install guide tailored to non-technical users.
 */
export const EmbedCodePanel = ({ landing, mode, onModeChange }: EmbedCodePanelProps) => {
  const snippet = buildSnippet(landing.id, mode);

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

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Vista previa</span>
        <EmbedPreview mode={mode} />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Tu código</span>
        <CodeBlock code={snippet} copyLabel="Copiar código" />
      </div>

      <EmbedInstallGuide mode={mode} />
    </div>
  );
};
