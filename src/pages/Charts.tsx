
import { useMemo, useRef, useState } from "react";
import type { ChartConfiguration } from "chart.js";
import { PageHeader } from "../components/Shell";
import { cssVar, useChart } from "../hooks/useChart";
import { useFinancialStartDay, useTransactions } from "../hooks/useData";
import {
  calendarMonthStart,
  financialPeriodFor,
  parseLocalDate,
  shiftDate,
  shiftFinancialPeriod,
  todayString,
} from "../lib/dates";
import {
  formatChartDate,
  formatCurrency,
  formatDateRange,
  formatMonth,
} from "../lib/format";
import type { Transaction } from "../lib/types";

type Preset =
  | "financial"
  | "previous"
  | "7"
  | "30"
  | "calendar"
  | "all"
  | "custom";

type Grain = "daily" | "weekly" | "monthly";

function weekStart(dateString: string): string {
  const d = parseLocalDate(dateString);
  const day = d.getDay();

  d.setDate(day === 0 ? d.getDate() - 6 : d.getDate() + 1 - day);

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function group(
  expenses: Transaction[],
  keyOf: (date: string) => string
): Array<[string, number]> {
  const map = new Map<string, number>();

  for (const t of expenses) {
    map.set(
      keyOf(t.date),
      (map.get(keyOf(t.date)) ?? 0) + Number(t.amount)
    );
  }

  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

const hueColors = (n: number) =>
  Array.from(
    { length: n },
    (_, i) => `hsl(${Math.round((360 / n) * i)}, 70%, 55%)`
  );

const axisMoney = (v: string | number) =>
  `Rs. ${Number(v).toLocaleString("en-LK")}`;

export default function Charts() {
  const transactions = useTransactions();
  const startDayQuery = useFinancialStartDay();
  const startDay = startDayQuery.data ?? 1;

  const [preset, setPreset] = useState<Preset>("financial");
  const [custom, setCustom] = useState<{ start: string; end: string }>({
    start: "",
    end: "",
  });
  const [appliedCustom, setAppliedCustom] = useState<{
    start: string;
    end: string;
  } | null>(null);

  const all = useMemo(() => transactions.data ?? [], [transactions.data]);

  const range = useMemo(() => {
    const today = todayString();

    switch (preset) {
      case "financial":
        return financialPeriodFor(today, startDay);

      case "previous":
        return financialPeriodFor(
          shiftFinancialPeriod(
            financialPeriodFor(today, startDay).start,
            startDay,
            -1
          ),
          startDay
        );

      case "7":
        return { start: shiftDate(today, -6), end: today };

      case "30":
        return { start: shiftDate(today, -29), end: today };

      case "calendar":
        return { start: calendarMonthStart(today), end: today };

      case "all": {
        const dates = all.map((t) => t.date).sort();

        return {
          start: dates[0] ?? today,
          end: dates[dates.length - 1] ?? today,
        };
      }

      default:
        return appliedCustom ?? { start: today, end: today };
    }
  }, [preset, startDay, all, appliedCustom]);

  const expenses = useMemo(
    () =>
      all.filter(
        (t) =>
          t.type === "expense" &&
          t.date >= range.start &&
          t.date <= range.end
      ),
    [all, range]
  );

  const grain: Grain = useMemo(() => {
    const days = Math.max(
      1,
      Math.round(
        (parseLocalDate(range.end).getTime() -
          parseLocalDate(range.start).getTime()) /
          86400000
      ) + 1
    );

    return days <= 45 ? "daily" : days <= 150 ? "weekly" : "monthly";
  }, [range]);

  const trend = useMemo(() => {
    const data =
      grain === "weekly"
        ? group(expenses, weekStart)
        : grain === "monthly"
          ? group(expenses, (d) => d.slice(0, 7))
          : group(expenses, (d) => d);

    const labels = data.map(([key]) =>
      grain === "daily"
        ? formatChartDate(key)
        : grain === "weekly"
          ? `Week of ${formatChartDate(key)}`
          : formatMonth(parseLocalDate(`${key}-01`))
    );

    return {
      labels,
      values: data.map(([, value]) => value),
    };
  }, [expenses, grain]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();

    for (const t of expenses) {
      const category = (t.category || "Other").trim() || "Other";

      map.set(
        category,
        (map.get(category) ?? 0) + Number(t.amount)
      );
    }

    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  const topExpenses = useMemo(() => {
    const map = new Map<string, number>();

    for (const t of expenses) {
      const description = t.description.trim() || "Other";

      map.set(
        description,
        (map.get(description) ?? 0) + Number(t.amount)
      );
    }

    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [expenses]);

  const trendRef = useRef<HTMLCanvasElement>(null);
  const topRef = useRef<HTMLCanvasElement>(null);
  const catRef = useRef<HTMLCanvasElement>(null);

  const hasData = expenses.length > 0;

  useChart(
    trendRef,
    hasData
      ? (): ChartConfiguration<"bar"> => ({
          type: "bar",
          data: {
            labels: trend.labels,
            datasets: [
              {
                label: "Expenses",
                data: trend.values,
                backgroundColor: cssVar("--expense"),
                borderRadius: 6,
                maxBarThickness: 48,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (c) =>
                    ` ${formatCurrency(c.parsed.y ?? 0)}`,
                },
              },
            },
            scales: {
              x: {
                ticks: { color: cssVar("--text-secondary") },
                grid: { display: false },
              },
              y: {
                beginAtZero: true,
                ticks: {
                  color: cssVar("--text-secondary"),
                  callback: axisMoney,
                },
                grid: { color: cssVar("--border") },
              },
            },
          },
        })
      : null,
    [trend, hasData]
  );

  useChart(
    topRef,
    hasData
      ? (): ChartConfiguration<"bar"> => ({
          type: "bar",
          data: {
            labels: topExpenses.map(([label]) => label),
            datasets: [
              {
                label: "Spent",
                data: topExpenses.map(([, value]) => value),
                backgroundColor: cssVar("--expense"),
                borderRadius: 6,
              },
            ],
          },
          options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (c) =>
                    ` ${formatCurrency(c.parsed.x ?? 0)}`,
                },
              },
            },
            scales: {
              x: {
                beginAtZero: true,
                ticks: {
                  color: cssVar("--text-secondary"),
                  callback: axisMoney,
                },
                grid: { color: cssVar("--border") },
              },
              y: {
                ticks: { color: cssVar("--text") },
                grid: { display: false },
              },
            },
          },
        })
      : null,
    [topExpenses, hasData]
  );

  useChart(
    catRef,
    hasData
      ? (): ChartConfiguration<"doughnut"> => {
          const total = byCategory.reduce(
            (sum, [, value]) => sum + value,
            0
          );

          return {
            type: "doughnut",
            data: {
              labels: byCategory.map(([label]) => label),
              datasets: [
                {
                  data: byCategory.map(([, value]) => value),
                  backgroundColor: hueColors(byCategory.length),
                  borderWidth: 2,
                  borderColor: cssVar("--surface"),
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              cutout: "58%",
              plugins: {
                legend: {
                  position: "right",
                  labels: {
                    color: cssVar("--text"),
                    padding: 16,
                  },
                },
                tooltip: {
                  callbacks: {
                    label: (c) =>
                      ` ${c.label}: ${formatCurrency(
                        Number(c.raw)
                      )} (${(
                        (Number(c.raw) / total) *
                        100
                      ).toFixed(1)}%)`,
                  },
                },
              },
            },
          };
        }
      : null,
    [byCategory, hasData]
  );

  const applyRange = () => {
    if (preset !== "custom") return;

    if (!custom.start || !custom.end) {
      alert("Choose both a start date and an end date.");
      return;
    }

    if (custom.start > custom.end) {
      alert("The start date must be on or before the end date.");
      return;
    }

    setAppliedCustom(custom);
  };

  const shownStart = preset === "custom" ? custom.start : range.start;
  const shownEnd = preset === "custom" ? custom.end : range.end;

  const title = (g: Grain) =>
    `${g.charAt(0).toUpperCase()}${g.slice(1)} Expenses`;

  return (
    <>
      <PageHeader
        title="Expense Charts"
        subtitle="Understand where your money is going."
      />

      <section className="panel chart-range-panel">
        <div className="chart-range-controls">
          <div className="form-group">
            <label htmlFor="rangePreset">Date range</label>
            <select
              id="rangePreset"
              value={preset}
              onChange={(e) => {
                const next = e.target.value as Preset;
                setPreset(next);

                if (next === "custom") {
                  setCustom({
                    start: range.start,
                    end: range.end,
                  });
                  setAppliedCustom({
                    start: range.start,
                    end: range.end,
                  });
                }
              }}
            >
              <option value="financial">Current financial period</option>
              <option value="previous">Previous financial period</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="calendar">Current calendar month</option>
              <option value="all">All time</option>
              <option value="custom">Custom range</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="rangeStart">From</label>
            <input
              type="date"
              id="rangeStart"
              value={shownStart}
              disabled={preset !== "custom"}
              onChange={(e) =>
                setCustom((c) => ({
                  ...c,
                  start: e.target.value,
                }))
              }
            />
          </div>

          <div className="form-group">
            <label htmlFor="rangeEnd">To</label>
            <input
              type="date"
              id="rangeEnd"
              value={shownEnd}
              disabled={preset !== "custom"}
              onChange={(e) =>
                setCustom((c) => ({
                  ...c,
                  end: e.target.value,
                }))
              }
            />
          </div>

          <button
            type="button"
            className="primary"
            onClick={applyRange}
          >
            Apply range
          </button>
        </div>

        <p className="chart-range-label">
          Showing {formatDateRange(range.start, range.end)}
        </p>
      </section>

      <section className="chart-grid">
        <article className="chart-card">
          <div className="chart-card-header category-header">
            <div>
              <h2>Spending by Category</h2>
              <p>
                See how your spending is divided between your categories.
              </p>
            </div>
            <p className="chart-range-label">
              Based on the selected date range
            </p>
          </div>

          <div className="chart-container category-chart-container">
            {hasData && <canvas ref={catRef} />}
          </div>

          {!hasData && (
            <p className="chart-empty">
              No expense data for this date range.
            </p>
          )}
        </article>

        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <h2>{title(grain)}</h2>
              <p>How much you spent over time.</p>
            </div>
          </div>

          <div className="chart-container">
            {hasData && <canvas ref={trendRef} />}
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <h2>Where You Spend Most</h2>
              <p>Your biggest expense descriptions.</p>
            </div>
          </div>

          <div className="chart-container chart-container-small">
            {hasData && <canvas ref={topRef} />}
          </div>

          {!hasData && (
            <div className="empty chart-empty">
              Add some expense transactions to see your spending patterns.
            </div>
          )}
        </div>
      </section>
    </>
  );
}
