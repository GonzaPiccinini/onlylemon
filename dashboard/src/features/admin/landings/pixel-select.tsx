import { useMemo } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MetaPixel } from "@/types/domain";
import { pixelLabel } from "./schemas";

type PixelSelectProps = {
  value: string;
  onChange: (id: string) => void;
  pixels: MetaPixel[];
  id?: string;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
};

/** Styled pixel picker built on the base-ui Select primitive (no native select). */
export const PixelSelect = ({
  value,
  onChange,
  pixels,
  id,
  invalid,
  disabled,
  className,
}: PixelSelectProps) => {
  const items = useMemo(
    () => Object.fromEntries(pixels.map((p) => [p.id, pixelLabel(p)])),
    [pixels],
  );

  return (
    <Select
      value={value || null}
      items={items}
      onValueChange={(next) => {
        if (typeof next === "string") onChange(next);
      }}
    >
      <SelectTrigger
        id={id}
        aria-invalid={invalid}
        disabled={disabled}
        className={className ?? "w-full"}
      >
        <SelectValue placeholder="— Seleccioná un pixel —" />
      </SelectTrigger>
      <SelectContent>
        {pixels.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {pixelLabel(p)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
