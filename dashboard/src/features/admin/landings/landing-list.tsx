import { useMemo, useState } from "react";
import {
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
  ToggleLeftIcon,
  ToggleRightIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PaginationControls } from "@/components/common/pagination-controls";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/format";
import type { Landing } from "@/types/domain";
import { useSetLandingStatus } from "@/features/admin/admin-hooks";
import { pixelLabel } from "./schemas";

const PAGE_SIZE = 10;

type LandingListProps = {
  landings: Landing[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewDraft: () => void;
};

const LandingListItem = ({
  landing,
  selected,
  onSelect,
}: {
  landing: Landing;
  selected: boolean;
  onSelect: () => void;
}) => {
  const setStatus = useSetLandingStatus();
  const isActive = landing.status === "ACTIVE";

  const toggle = async () => {
    try {
      await setStatus.mutateAsync({ landingId: landing.id, enabled: !isActive });
      toast.success(isActive ? "Landing deshabilitada" : "Landing habilitada");
    } catch {
      toast.error("No se pudo actualizar el estado");
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={selected}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "group flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors duration-150 motion-reduce:transition-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        selected
          ? "border-primary/40 bg-primary/10"
          : "border-transparent hover:bg-muted/50",
      )}
    >
      <span
        aria-hidden="true"
        title={isActive ? "Activa" : "Deshabilitada"}
        className={cn(
          "inline-block size-2.5 shrink-0 rounded-full",
          isActive ? "bg-primary glow-sm" : "border border-muted-foreground/50 bg-transparent",
        )}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium" title={landing.url}>
          {landing.url}
        </span>
        <div className="flex items-center gap-2 text-xs">
          {landing.metaPixel ? (
            <span
              title={landing.metaPixel.label || landing.metaPixel.pixelId}
              className="max-w-[55%] truncate rounded-full bg-primary/10 px-1.5 py-0.5 font-medium text-primary"
            >
              {landing.metaPixel.label || landing.metaPixel.pixelId}
            </span>
          ) : (
            <span className="text-muted-foreground">Sin pixel</span>
          )}
          <span className="text-muted-foreground">·</span>
          <span className="shrink-0 text-muted-foreground">
            {formatRelativeTime(landing.updatedAt)}
          </span>
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Acciones de la landing"
              className="shrink-0 opacity-60 group-hover:opacity-100"
            />
          }
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontalIcon className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={toggle}>
            {isActive ? (
              <ToggleLeftIcon className="size-4" />
            ) : (
              <ToggleRightIcon className="size-4" />
            )}
            {isActive ? "Deshabilitar" : "Habilitar"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export const LandingList = ({
  landings,
  isLoading,
  selectedId,
  onSelect,
  onNewDraft,
}: LandingListProps) => {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return landings;
    return landings.filter((l) => {
      const pixel = l.metaPixel ? pixelLabel(l.metaPixel).toLowerCase() : "";
      return l.url.toLowerCase().includes(q) || pixel.includes(q);
    });
  }, [landings, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const normalizedPage = Math.min(page, totalPages);
  const start = (normalizedPage - 1) * PAGE_SIZE;
  const paginated = filtered.slice(start, start + PAGE_SIZE);

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar por URL o pixel…"
            aria-label="Buscar landings"
            className="pl-8"
          />
        </div>
        <Button
          type="button"
          size="icon-sm"
          onClick={onNewDraft}
          aria-label="Nueva landing"
          title="Nueva landing"
        >
          <PlusIcon />
        </Button>
      </div>

      <div className="scrollbar-thin flex flex-1 flex-col gap-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex flex-col gap-2 p-1">
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">
            {search ? "Sin resultados para tu búsqueda." : "No hay landings registradas."}
          </p>
        ) : (
          paginated.map((landing) => (
            <LandingListItem
              key={landing.id}
              landing={landing}
              selected={landing.id === selectedId}
              onSelect={() => onSelect(landing.id)}
            />
          ))
        )}
      </div>

      {totalPages > 1 && (
        <PaginationControls page={normalizedPage} totalPages={totalPages} onPageChange={setPage} />
      )}
    </div>
  );
};
