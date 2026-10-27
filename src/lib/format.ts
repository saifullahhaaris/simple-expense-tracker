import { parseLocalDate } from "./dates";

export function formatCurrency(amount: number | string): string {
  return `Rs. ${Number(amount).toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(dateString: string): string {
  return parseLocalDate(dateString).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatChartDate(dateString: string): string {
  return parseLocalDate(dateString).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export function formatMonth(date: Date): string {
  return date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

export function formatDateRange(start: string, end: string): string {
  return `${formatDate(start)} – ${formatDate(end)}`;
}
