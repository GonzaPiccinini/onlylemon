import { ARGENTINA_TZ } from "./timezone";

export const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(amount);

export const formatPercentage = (value: number): string =>
  `${value.toFixed(1)}%`;

export const formatDateTime = (value: string): string => {
  const date = new Date(value);
  const datePart = new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: ARGENTINA_TZ,
  }).format(date);
  const timePart = new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ARGENTINA_TZ,
  }).format(date);
  return `${datePart}, ${timePart}`;
};

export const formatHours = (value: number): string => `${value.toFixed(2)} h`;
