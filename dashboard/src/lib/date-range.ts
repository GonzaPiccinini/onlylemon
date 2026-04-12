import { addDays, format } from "date-fns";
import type { DateRangeFilters } from "@/types/domain";

export const getDefaultDateRange = (): DateRangeFilters => {
  const to = new Date();
  const from = addDays(to, -7);

  return {
    from: format(from, "yyyy-MM-dd"),
    to: format(to, "yyyy-MM-dd"),
  };
};
