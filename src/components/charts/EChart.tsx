import { useEffect, useRef, type CSSProperties } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, MarkAreaComponent, MarkLineComponent, LegendComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';

echarts.use([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, MarkAreaComponent, MarkLineComponent, LegendComponent, SVGRenderer]);

/** Thin React wrapper around Apache ECharts (tree-shaken, SVG renderer). */
export function EChart({ option, height = 200, width = '100%', className, style, ariaLabel }: {
  option: EChartsCoreOption;
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
    const chart = echarts.init(ref.current, undefined, { renderer: 'svg' });
    chartRef.current = chart;
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true });
  }, [option]);

  return <div ref={ref} role="img" aria-label={ariaLabel} className={className} style={{ width, height, ...style }} />;
}
