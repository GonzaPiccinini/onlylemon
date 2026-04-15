import type { DateRangeFilters } from "@/types/domain";
import { getArgentinaTodayString, shiftArgentinaDay } from "./timezone";

export const getDefaultDateRange = (): DateRangeFilters => {
  const to = getArgentinaTodayString();
  const from = shiftArgentinaDay(to, -7);

  return { from, to };
};
