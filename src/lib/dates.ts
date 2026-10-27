export interface Period {
  start: string;
  end: string;
}

export function parseLocalDate(dateString: string): Date {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayString(): string {
  return toISODate(new Date());
}

function monthStart(year: number, monthIndex: number, preferredDay: number): Date {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(preferredDay, lastDay));
}

/** The financial period (e.g. 25th → 24th) that contains `dateString`. */
export function financialPeriodFor(dateString: string, startDay: number): Period {
  const date = parseLocalDate(dateString);
  let start = monthStart(date.getFullYear(), date.getMonth(), startDay);
  if (date < start) start = monthStart(date.getFullYear(), date.getMonth() - 1, startDay);
  const nextStart = monthStart(start.getFullYear(), start.getMonth() + 1, startDay);
  const end = new Date(nextStart);
  end.setDate(end.getDate() - 1);
  return { start: toISODate(start), end: toISODate(end) };
}

export function shiftFinancialPeriod(periodStart: string, startDay: number, direction: -1 | 1): string {
  const start = parseLocalDate(periodStart);
  const target = new Date(start.getFullYear(), start.getMonth() + direction, 1);
  return toISODate(monthStart(target.getFullYear(), target.getMonth(), startDay));
}

export function shiftDate(dateString: string, days: number): string {
  const date = parseLocalDate(dateString);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

export function calendarMonthStart(dateString: string): string {
  const d = parseLocalDate(dateString);
  return toISODate(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function ordinal(day: number): string {
  return `${day}${day === 1 ? "st" : day === 2 ? "nd" : day === 3 ? "rd" : "th"}`;
}
