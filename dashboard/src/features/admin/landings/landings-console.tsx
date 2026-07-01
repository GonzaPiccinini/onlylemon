import { useState } from "react";
import { Globe, MousePointerClickIcon, Share2,  } from "lucide-react";

import { PageHeader } from "@/components/common/page-header";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useLandings, useMetaPixels } from "@/features/admin/admin-hooks";
import { LandingList } from "./landing-list";
import { LandingDetail } from "./landing-detail";
import { PixelsPanel } from "./pixels-panel";

type Section = "landings" | "pixels";

const DetailEmptyState = () => (
  <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
    <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
      <MousePointerClickIcon className="size-6" />
    </span>
    <div className="flex flex-col gap-1">
      <p className="font-heading text-sm font-semibold">Seleccioná una landing</p>
      <p className="max-w-xs text-sm text-muted-foreground">
        Elegí una landing de la lista para ver su resumen, editar su configuración y copiar el
        código de integración.
      </p>
    </div>
  </div>
);

export const LandingsConsole = () => {
  const { data: landings = [], isLoading } = useLandings();
  const { data: pixels = [] } = useMetaPixels();

  const [section, setSection] = useState<Section>("landings");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDraft, setIsDraft] = useState(false);

  const selectedLanding = selectedId ? landings.find((l) => l.id === selectedId) ?? null : null;
  const detailOpen = isDraft || Boolean(selectedLanding);

  const selectLanding = (id: string) => {
    setSelectedId(id);
    setIsDraft(false);
  };

  const startDraft = () => {
    setIsDraft(true);
    setSelectedId(null);
  };

  const handleCreated = (landingId: string) => {
    setIsDraft(false);
    setSelectedId(landingId);
  };

  const backToList = () => {
    setSelectedId(null);
    setIsDraft(false);
  };

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
      <PageHeader
        title="Landings"
        description="Administrá tus landings y los pixels de seguimiento que comparten."
      />

      <Tabs
        value={section}
        onValueChange={(value) => setSection(value as Section)}
        className="min-h-0 flex-1 gap-4"
      >
        <TabsList variant="segmented">
          <TabsTrigger value="landings">
            <Globe data-icon="inline-start" className="size-3.5" />
            Landings
          </TabsTrigger>
          <TabsTrigger value="pixels">
            <Share2 data-icon="inline-start" className="size-3.5" />
            Pixels
          </TabsTrigger>
        </TabsList>

        <TabsContent value="landings" className="min-h-0 min-w-0 flex-1" keepMounted>
          <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[minmax(300px,360px)_1fr]">
            {/* Master — list */}
            <div className={cn("min-h-0 min-w-0", detailOpen ? "hidden lg:block" : "block")}>
              <Card className="h-full min-h-0 gap-0 p-0">
                <LandingList
                  landings={landings}
                  isLoading={isLoading}
                  selectedId={selectedId}
                  onSelect={selectLanding}
                  onNewDraft={startDraft}
                />
              </Card>
            </div>

            {/* Detail */}
            <div className={cn("min-h-0 min-w-0", detailOpen ? "block" : "hidden lg:block")}>
              <Card className="h-full min-h-0 gap-0 p-0">
                {detailOpen ? (
                  <LandingDetail
                    key={selectedLanding?.id ?? "draft"}
                    landing={selectedLanding}
                    pixels={pixels}
                    onBack={backToList}
                    onCreated={handleCreated}
                    onGoToPixels={() => setSection("pixels")}
                  />
                ) : (
                  <DetailEmptyState />
                )}
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="pixels" className="scrollbar-thin min-h-0 min-w-0 flex-1 overflow-y-auto" keepMounted>
          <PixelsPanel />
        </TabsContent>
      </Tabs>
    </section>
  );
};
