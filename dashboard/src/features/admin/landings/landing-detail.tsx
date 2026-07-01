import { useState } from "react";
import { ArrowLeftIcon, Code2Icon, ExternalLinkIcon, Info, Pen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { Landing, MetaPixel } from "@/types/domain";
import { LandingDetailSummary } from "./landing-detail-summary";
import { LandingDetailConfig } from "./landing-detail-config";
import { EmbedCodePanel } from "./embed-code-panel";
import type { EmbedMode } from "./embed";

type LandingDetailProps = {
  /** null → draft/create mode. */
  landing: Landing | null;
  pixels: MetaPixel[];
  onBack: () => void;
  onCreated: (landingId: string) => void;
  onGoToPixels: () => void;
};

export const LandingDetail = ({
  landing,
  pixels,
  onBack,
  onCreated,
  onGoToPixels,
}: LandingDetailProps) => {
  // This component is remounted (via key) whenever the selected landing
  // changes, so local state like the embed mode resets naturally per landing.
  const [embedMode, setEmbedMode] = useState<EmbedMode>("boton-flotante");

  const isActive = landing?.status === "ACTIVE";

  return (
    <div className="flex h-full min-w-0 flex-col">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-foreground/8 p-4">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            aria-label="Volver a la lista"
            onClick={onBack}
          >
            <ArrowLeftIcon className="size-4" />
          </Button>

          {landing ? (
            <span
              aria-hidden="true"
              className={cn(
                "inline-block size-2.5 shrink-0 rounded-full",
                isActive ? "bg-primary glow-sm" : "bg-muted-foreground/40",
              )}
            />
          ) : null}

          <div className="min-w-0 flex-1">
            {landing ? (
              <a
                href={landing.url}
                target="_blank"
                rel="noreferrer"
                title={landing.url}
                className="group flex min-w-0 max-w-full items-center gap-1.5 font-heading text-sm font-semibold leading-tight hover:text-primary"
              >
                <span className="min-w-0 truncate">{landing.url}</span>
                <ExternalLinkIcon className="size-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
              </a>
            ) : (
              <h2 className="font-heading text-base font-semibold leading-tight md:text-lg">
                Nueva landing
              </h2>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="scrollbar-thin min-w-0 flex-1 overflow-y-auto p-4">
        {landing ? (
          <Tabs defaultValue="resumen" className="min-w-0 gap-4">
            <TabsList variant="segmented">
              <TabsTrigger value="resumen">
                <Info data-icon="inline-start" className="size-3.5" />
                <span className="hidden md:block">Información</span>
              </TabsTrigger>
              <TabsTrigger value="config">
                <Pen data-icon="inline-start" className="size-3.5" />
                <span className="hidden md:block">Configuración</span>
              </TabsTrigger>
              <TabsTrigger value="codigo">
                <Code2Icon data-icon="inline-start" className="size-3.5" />
                <span className="hidden md:block">Integración</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="resumen">
              <LandingDetailSummary landing={landing} pixels={pixels} />
            </TabsContent>
            <TabsContent value="config" keepMounted>
              <LandingDetailConfig
                landing={landing}
                pixels={pixels}
                onCreated={onCreated}
                onGoToPixels={onGoToPixels}
              />
            </TabsContent>
            <TabsContent value="codigo">
              <EmbedCodePanel landing={landing} mode={embedMode} onModeChange={setEmbedMode} />
            </TabsContent>
          </Tabs>
        ) : (
          <LandingDetailConfig
            landing={null}
            pixels={pixels}
            onCreated={onCreated}
            onGoToPixels={onGoToPixels}
          />
        )}
      </div>
    </div>
  );
};
