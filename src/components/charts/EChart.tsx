import { useEffect, useRef, type CSSProperties } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart, ScatterChart, GraphChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, MarkAreaComponent, MarkLineComponent, LegendComponent } from 'echarts/components';
import { SVGRenderer, CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';

echarts.use([BarChart, LineChart, PieChart, ScatterChart, GraphChart, GridComponent, TooltipComponent, MarkAreaComponent, MarkLineComponent, LegendComponent, SVGRenderer, CanvasRenderer]);

/** Thin React wrapper around Apache ECharts (tree-shaken, SVG renderer). */
export function EChart({ option, height = 200, width = '100%', className, style, ariaLabel, renderer = 'svg', onEvents, onReady }: {
  option: EChartsCoreOption;
  renderer?: 'svg' | 'canvas';
  onEvents?: Record<string, (params: any) => void>; // eslint-disable-line @typescript-eslint/no-explicit-any
  onReady?: (chart: echarts.ECharts) => void;
  height?: number | string;
  width?: number | string;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer });
    chartRef.current = chart;
    onReady?.(chart);
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderer]);

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true });
  }, [option]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !onEvents) return;
    Object.entries(onEvents).forEach(([ev, fn]) => chart.on(ev, fn));
    return () => { Object.keys(onEvents).forEach(ev => chart.off(ev)); };
  }, [onEvents]);

  return <div ref={ref} role="img" aria-label={ariaLabel} className={className} style={{ width, height, ...style }} />;
}
