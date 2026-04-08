export const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(amount);

export const formatPercentage = (value: number): string =>
  `${value.toFixed(1)}%`;

export const formatDateTime = (value: string): string =>
  new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));

export const formatHours = (value: number): string => `${value.toFixed(2)} h`;
