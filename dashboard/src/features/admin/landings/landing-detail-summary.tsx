import { MessageCircleIcon, PhoneIcon, RadioIcon } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import type { Landing, MetaPixel } from "@/types/domain";
import { formatRelativeTime } from "@/lib/format";
import { useLandingFallbackPhones } from "@/features/admin/admin-hooks";

type LandingDetailSummaryProps = {
  landing: Landing;
  pixels: MetaPixel[];
};

const StatTile = ({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof PhoneIcon;
  value: string | number;
  label: string;
}) => (
  <div className="flex items-center gap-3 rounded-xl glass-subtle p-3">
    <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
      <Icon className="size-4" />
    </span>
    <div className="flex flex-col leading-tight">
      <span className="text-base font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  </div>
);

/** Read-only quick view of the selected landing. */
export const LandingDetailSummary = ({ landing, pixels }: LandingDetailSummaryProps) => {
  const { data: phones = [], isLoading: phonesLoading } = useLandingFallbackPhones(landing.id);
  const pixel = pixels.find((p) => p.id === landing.metaPixelId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      {/* Linked pixel card */}
      <div className="rounded-xl glass-subtle p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <RadioIcon className="size-3.5" />
          Pixel vinculado
        </div>
        {landing.metaPixel ? (
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="font-mono text-sm font-medium break-all">
                {landing.metaPixel.pixelId}
              </span>
              {landing.metaPixel.label && (
                <span className="min-w-0 text-sm text-muted-foreground break-words">
                  · {landing.metaPixel.label}
                </span>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              {pixel
                ? `${pixel.landingCount} landing(s) · ${pixel.leadCount} lead(s)`
                : "Uso no disponible"}
            </span>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">Sin pixel vinculado</span>
        )}
      </div>

      {/* Counts */}
      <div className="grid gap-3 sm:grid-cols-2">
        <StatTile
          icon={MessageCircleIcon}
          value={landing.whatsappMessages?.length ?? 0}
          label="Mensajes de WhatsApp"
        />
        {phonesLoading ? (
          <Skeleton className="h-16 w-full rounded-xl" />
        ) : (
          <StatTile icon={PhoneIcon} value={phones.length} label="Teléfonos de respaldo" />
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Última actualización: {formatRelativeTime(landing.updatedAt)}
      </p>
    </div>
  );
};
