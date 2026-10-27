import { useEffect, useRef, type RefObject } from "react";
import {
  ArcElement, BarController, BarElement, CategoryScale, Chart, DoughnutController, Legend, LinearScale, Tooltip,
  type ChartConfiguration
} from "chart.js";
import { useTheme } from "../context/ThemeContext";

Chart.register(ArcElement, BarController, BarElement, CategoryScale, DoughnutController, Legend, LinearScale, Tooltip);

export const cssVar = (name: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Creates a Chart.js chart on a canvas; rebuilds it when data or theme change and always cleans up. */
export function useChart(canvasRef: RefObject<HTMLCanvasElement>, build: (() => ChartConfiguration) | null, deps: unknown[]) {
  const { theme } = useTheme();
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    chartRef.current?.destroy();
    chartRef.current = null;
    const canvas = canvasRef.current;
    if (!canvas || !build) return;
    // CSS variables are read inside build(); the theme attribute is already applied by ThemeProvider.
    chartRef.current = new Chart(canvas, build());
    return () => { chartRef.current?.destroy(); chartRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, ...deps]);
}
