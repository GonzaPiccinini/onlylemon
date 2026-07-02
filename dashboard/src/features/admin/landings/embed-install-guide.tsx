import { useState } from "react";
import { ExternalLink } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EMBED_MODE_INFO, type EmbedMode } from "./embed";
import { NumberedSteps } from "./embed-shared";
import { INTEGRATION, PLATFORMS, type IntegrationGuide, type PlatformId } from "./embed-install";

/** Static id→name map for the base-ui Select `items` prop. */
const PLATFORM_ITEMS = Object.fromEntries(PLATFORMS.map((p) => [p.id, p.name]));

type EmbedInstallGuideProps = {
  mode: EmbedMode;
  onModeChange: (mode: EmbedMode) => void;
};

/**
 * One MODE × PLATFORM cell (`INTEGRATION[mode][platform]`), rendered by
 * `guide.feasibility`:
 *  - "ok"          → just the numbered steps, plus a gotcha/source if present.
 *  - "needs-code"  → a warning-toned note up front (this needs editing
 *                    theme/template code — a technical profile), with an
 *                    escape hatch to `guide.recommend` when a friendlier mode
 *                    exists. The steps are still shown below: some owners
 *                    ARE technical and will just do it.
 *  - "not-viable"  → a destructive alert with the honest explanation of why
 *                    (no fake numbered steps), plus a prominent button to
 *                    switch to `guide.recommend`, which is always present for
 *                    this feasibility.
 */
function CellGuide({
  guide,
  platformName,
  onModeChange,
}: {
  guide: IntegrationGuide;
  platformName: string;
  onModeChange: (mode: EmbedMode) => void;
}) {
  if (guide.feasibility === "not-viable") {
    const recommended = EMBED_MODE_INFO[guide.recommend!];
    return (
      <Alert variant="destructive">
        <AlertTitle>No disponible en {platformName}</AlertTitle>
        <AlertDescription className="flex flex-col gap-2.5">
          <p>{guide.steps.join(" ")}</p>
          <Button size="sm" className="w-fit" onClick={() => onModeChange(guide.recommend!)}>
            Usá {recommended.label}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {guide.feasibility === "needs-code" && (
        <Alert className="border-warning/50 bg-warning/10 text-warning">
          <AlertTitle>Requiere un paso técnico</AlertTitle>
          <AlertDescription className="flex flex-col gap-2.5 text-warning/90">
            <p>
              Para instalarlo en {platformName} con este modo hace falta un paso técnico extra
              (editar el código de tu tema o configurar una herramienta externa). Seguí los pasos de
              abajo si te animás.
            </p>
            {guide.recommend && (
              <>
                <p>Si no manejás código, te conviene {EMBED_MODE_INFO[guide.recommend].label}.</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={() => onModeChange(guide.recommend!)}
                >
                  Cambiar a {EMBED_MODE_INFO[guide.recommend].label}
                </Button>
              </>
            )}
          </AlertDescription>
        </Alert>
      )}

      <NumberedSteps steps={guide.steps} />

      {guide.gotcha && (
        <p className="rounded-md bg-muted/40 px-2.5 py-2 text-xs text-muted-foreground">
          {guide.gotcha}
        </p>
      )}

      {guide.sourceUrl && (
        <a
          href={guide.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Ver la ayuda oficial
          <ExternalLink className="size-3" aria-hidden="true" />
        </a>
      )}
    </div>
  );
}

/**
 * The "¿Cómo lo instalo?" section: pick your platform once, then read the
 * exact steps for the current mode on that platform. The platform choice is
 * owned here (not lifted to the parent) so it survives mode switches — most
 * owners only build on one platform, and re-asking on every mode change
 * would be annoying.
 */
export function EmbedInstallGuide({ mode, onModeChange }: EmbedInstallGuideProps) {
  const [platform, setPlatform] = useState<PlatformId | "">("");

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">¿Cómo lo instalo?</h3>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="install-guide-platform" className="text-sm text-muted-foreground">
          ¿Con qué armaste tu página?
        </label>
        <Select
          value={platform || null}
          items={PLATFORM_ITEMS}
          onValueChange={(next) => {
            if (typeof next === "string") setPlatform(next as PlatformId);
          }}
        >
          <SelectTrigger id="install-guide-platform" className="w-full sm:w-64">
            <SelectValue placeholder="Elegí tu plataforma" />
          </SelectTrigger>
          <SelectContent>
            {PLATFORMS.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {platform === "" ? (
        <p className="text-sm text-muted-foreground">
          Elegí tu plataforma para ver los pasos exactos.
        </p>
      ) : (
        <CellGuide
          guide={INTEGRATION[mode][platform]}
          platformName={PLATFORMS.find((p) => p.id === platform)!.name}
          onModeChange={onModeChange}
        />
      )}
    </section>
  );
}
