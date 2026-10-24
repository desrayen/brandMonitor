import type { EChartsCoreOption } from 'echarts/core';

// Zinc dark palette, matching the dashboard (shadcn-style tokens)
export const theme = {
  text: '#fafafa',
  muted: '#a1a1aa',
  subtle: '#71717a',
  border: '#27272a',
  borderStrong: '#3f3f46',
  card: '#18181b',
  track: 'rgba(255,255,255,.04)',
  orange: '#f97316',
  blue: '#3b82f6',
  sans: 'Inter, system-ui, sans-serif',
  mono: "'JetBrains Mono', ui-monospace, monospace",
};

const tooltip = {
  backgroundColor: theme.card,
  borderColor: theme.borderStrong,
  borderWidth: 1,
  padding: [8, 12],
  textStyle: { color: theme.text, fontFamily: theme.sans, fontSize: 12 },
  extraCssText: 'border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.4);',
};

const base = {
  animationDuration: 500,
  animationEasing: 'cubicOut' as const,
  textStyle: { fontFamily: theme.sans },
};

type Datum = { name: string; value: number; color?: string; label?: string };

/** Horizontal bar list: label on the left, value column on the right. */
export function hBarOption({ data, format = String, tooltipText, labelWidth = 120, valueWidth = 56, color = theme.orange }: {
  data: Datum[];
  format?: (v: number) => string;
  tooltipText?: (index: number) => string;
  labelWidth?: number;
  valueWidth?: number;
  color?: string;
}): EChartsCoreOption {
  const names = data.map(d => d.name);
  return {
    ...base,
    grid: { left: labelWidth, right: valueWidth, top: 0, bottom: 0 },
    tooltip: { ...tooltip, trigger: 'item', formatter: (p: { dataIndex: number; name: string; value: number }) => tooltipText ? tooltipText(p.dataIndex) : `${p.name}<br/><b style="font-family:${theme.mono}">${format(p.value)}</b>` },
    xAxis: { type: 'value', show: false, min: 0, max: (v: { max: number }) => v.max },
    yAxis: [{
      type: 'category', inverse: true, data: names,
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: theme.muted, fontSize: 12, width: labelWidth - 12, overflow: 'truncate', margin: labelWidth, align: 'left' },
    }, {
      type: 'category', inverse: true, position: 'right', data: data.map(d => d.label ?? format(d.value)),
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: theme.muted, fontSize: 12, fontFamily: theme.mono, margin: valueWidth, align: 'right' },
    }],
    series: [{
      type: 'bar', barWidth: 8, barMinHeight: 6,
      showBackground: true, backgroundStyle: { color: theme.track, borderRadius: 4 },
      itemStyle: { borderRadius: 4 },
      emphasis: { focus: 'self', itemStyle: { shadowBlur: 10, shadowColor: 'rgba(249,115,22,.4)' } },
      data: data.map(d => ({ value: d.value, itemStyle: { color: d.color ?? color } })),
    }],
  };
}

/** Vertical bars with category labels under the axis. */
export function vBarOption({ data, format = String, tooltipText, barMaxWidth = 40, height }: {
  data: Datum[];
  format?: (v: number) => string;
  tooltipText?: (index: number) => string;
  barMaxWidth?: number;
  height?: number;
}): EChartsCoreOption {
  return {
    ...base,
    grid: { left: 0, right: 0, top: 24, bottom: 0, containLabel: true },
    tooltip: { ...tooltip, trigger: 'item', formatter: (p: { dataIndex: number; name: string; value: number }) => tooltipText ? tooltipText(p.dataIndex) : `${p.name}<br/><b style="font-family:${theme.mono}">${format(p.value)}</b>` },
    xAxis: {
      type: 'category', data: data.map(d => d.name),
      axisLine: { lineStyle: { color: theme.border } }, axisTick: { show: false },
      axisLabel: { color: theme.subtle, fontSize: 10, interval: 0, lineHeight: 12, formatter: (v: string) => v.replace(/\//g, '/\n').replace(/ /g, '\n') },
    },
    yAxis: { type: 'value', show: false },
    series: [{
      type: 'bar', barMaxWidth, barCategoryGap: '30%',
      itemStyle: { borderRadius: [4, 4, 0, 0] },
      label: { show: true, position: 'top', color: theme.text, fontFamily: theme.mono, fontSize: 11, formatter: (p: { value: number }) => format(p.value) },
      data: data.map(d => ({ value: d.value, itemStyle: { color: d.color ?? theme.orange } })),
    }],
  };
}

/** Donut with a big number in the middle. */
export function donutOption({ data, centerValue, centerLabel, format = String }: {
  data: Datum[];
  centerValue: string;
  centerLabel: string;
  format?: (v: number) => string;
}): EChartsCoreOption {
  return {
    ...base,
    tooltip: { ...tooltip, trigger: 'item', formatter: (p: { name: string; value: number; percent: number; color: string }) => `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${p.color};margin-right:6px"></span>${p.name}<br/><b style="font-family:${theme.mono}">${format(p.value)}</b> <span style="color:${theme.subtle}">· ${p.percent.toFixed(1)}%</span>` },
    series: [{
      type: 'pie', radius: ['60%', '84%'], center: ['50%', '50%'], padAngle: 2, minAngle: 3,
      itemStyle: { borderRadius: 3, borderColor: theme.card, borderWidth: 1 },
      label: {
        show: true, position: 'center', silent: true,
        formatter: () => `{v|${centerValue}}\n{l|${centerLabel}}`,
        rich: {
          v: { color: theme.text, fontSize: 20, fontWeight: 600, fontFamily: theme.mono, lineHeight: 26 },
          l: { color: theme.subtle, fontSize: 10, lineHeight: 14 },
        },
      },
      emphasis: { scale: true, scaleSize: 4, label: { show: true } },
      labelLine: { show: false },
      data: data.map(d => ({ name: d.name, value: d.value, itemStyle: { color: d.color } })),
    }],
  };
}

/** Area line chart with an optional highlighted peak band. */
export function lineOption({ labels, values, peakIndex, tooltipText, color = theme.blue }: {
  labels: string[];
  values: number[];
  peakIndex?: number;
  tooltipText?: (index: number) => string;
  color?: string;
}): EChartsCoreOption {
  return {
    ...base,
    grid: { left: 0, right: 8, top: 16, bottom: 0, containLabel: true },
    tooltip: {
      ...tooltip, trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: theme.borderStrong, type: 'dashed' } },
      formatter: (ps: { dataIndex: number; name: string; value: number }[]) => tooltipText ? tooltipText(ps[0].dataIndex) : `${ps[0].name}<br/><b>${ps[0].value}</b>`,
    },
    xAxis: {
      type: 'category', boundaryGap: false, data: labels,
      axisLine: { lineStyle: { color: theme.border } }, axisTick: { show: false },
      axisLabel: { color: theme.subtle, fontSize: 10, fontFamily: theme.mono },
    },
    yAxis: {
      type: 'value', splitNumber: 3,
      axisLabel: { color: theme.subtle, fontSize: 10, fontFamily: theme.mono },
      splitLine: { lineStyle: { color: theme.border, type: 'dashed' } },
    },
    series: [{
      type: 'line', smooth: 0.3, symbol: 'circle', symbolSize: 6, showSymbol: true,
      lineStyle: { color, width: 2 },
      itemStyle: { color: theme.card, borderColor: color, borderWidth: 1.5 },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(59,130,246,.25)' }, { offset: 1, color: 'rgba(59,130,246,0)' }] } },
      emphasis: { scale: 1.6 },
      markArea: peakIndex === undefined ? undefined : {
        silent: true,
        itemStyle: { color: 'rgba(249,115,22,.08)' },
        label: { show: true, position: 'insideTop', color: theme.orange, fontSize: 10, formatter: 'Peak' },
        data: [[{ xAxis: labels[Math.max(0, peakIndex - 1)] }, { xAxis: labels[Math.min(labels.length - 1, peakIndex + 1)] }]],
      },
      data: values,
    }],
  };
}
