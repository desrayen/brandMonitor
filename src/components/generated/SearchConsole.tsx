import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, BarChart3, ChevronDown, ChevronLeft, ChevronRight, Download, ExternalLink, Eye, Gauge, Loader2, MousePointerClick, Percent, Plus, Search, Settings2, Tag, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { DateRangePicker, presetRange, type DateRange } from './DateRangePicker';
import { useIsSuperAdmin } from './ThreadsMonitor';
import { StatCard } from '../StatCard';
import { EChart } from '../charts/EChart';
import { lineOption, theme } from '../charts/options';

type Site = { site_url: string; backfill_cursor: string | null; recent_synced_at: string | null; last_error: string | null; brand_terms: string[]; brand_fuzzy: boolean };
type Trend = { date: string; clicks: number; impressions: number; ctr: number; avg_position: number | null };
type TopRow = { key: string; clicks: number; impressions: number; ctr: number; avg_position: number | null; related: number; is_brand: boolean | null; total_count: number };
type GapRow = { query: string; clicks: number; impressions: number; ctr: number; avg_position: number | null; pages: number; top_page: string; top_share: number; second_page: string | null; second_share: number; match_score: number | null; is_brand: boolean; issues: string[]; total_count: number };
type Split = { segment: 'brand' | 'nonbrand'; clicks: number; impressions: number; queries: number };
type Group = 'query' | 'page';
type Brand = 'all' | 'brand' | 'nonbrand';
type SortKey = 'key' | 'clicks' | 'impressions' | 'ctr' | 'position';
type View = 'performance' | 'gaps' | 'brand';
type Span = { start: string; end: string };

const PAGE = 50;
const ALL: Span = { start: '2000-01-01', end: '2100-01-01' };
const fmt = (n: number | null | undefined) => Number(n ?? 0).toLocaleString('en-US');
const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
const pct0 = (n: number) => `${Math.round(n * 100)}%`;
const pos = (n: number | null) => (n == null ? '–' : Number(n).toFixed(1));
const siteLabel = (s: string) => s.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '').replace(/\/$/, '');
const pathOf = (u: string) => u.replace(/^https?:\/\/[^/]+/, '') || '/';
const pill = (on: boolean) => `filter-chip ${on ? 'active' : ''}`;
const lev = (a: string, b: string) => {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) { const tmp = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = tmp; }
  }
  return d[b.length];
};
// The word in a query closest to any brand keyword (used for "Add as keyword")
const closestWord = (query: string, terms: string[]) => {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 3);
  let best = words[0] ?? query, score = Infinity;
  for (const w of words) for (const t of terms) { const d = lev(w, t.replace(/\s+/g, '').toLowerCase()); if (d < score) { score = d; best = w; } }
  return best;
};

const ISSUES: Record<string, { label: string; cls: string; help: string }> = {
  mismatch: { label: 'Page mismatch', cls: 'bad', help: 'The page that ranks for this query does not contain most of the query words in its URL — likely no dedicated page for this topic yet.' },
  homepage: { label: 'Only homepage', cls: 'run', help: 'Only the homepage shows up for this non-brand query — there is no specific page for it.' },
  cannibal: { label: 'Cannibalization', cls: 'warn', help: 'Two or more pages share the impressions (the 2nd page gets ≥20%) — they compete with each other.' },
  noclick: { label: 'No clicks', cls: 'off', help: 'The query gets impressions but no clicks — improve the title/description or ranking.' },
};

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

async function rpc<T>(fn: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return (data ?? []) as T[];
}

function downloadCsv(name: string, head: string[], rows: unknown[][]) {
  const esc = (v: unknown) => { const s = v == null ? '' : Array.isArray(v) ? v.join('; ') : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [head.join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

function Pager({ offset, total, setOffset }: { offset: number; total: number; setOffset: (n: number) => void }) {
  if (total <= PAGE) return null;
  return <div className="flex items-center justify-center gap-3 pt-4 text-[12px] text-zinc-400">
    <button className="filter-chip inline-flex items-center gap-1" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}><ChevronLeft size={13} />Prev</button>
    <span>{fmt(offset + 1)}–{fmt(Math.min(offset + PAGE, total))} of {fmt(total)}</span>
    <button className="filter-chip inline-flex items-center gap-1" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>Next<ChevronRight size={13} /></button>
  </div>;
}

function BrandChips({ value, onChange }: { value: Brand; onChange: (b: Brand) => void }) {
  return <div className="flex flex-wrap gap-1.5">
    <button className={pill(value === 'all')} onClick={() => onChange('all')}>All queries</button>
    <button className={pill(value === 'brand')} onClick={() => onChange('brand')}>Brand</button>
    <button className={pill(value === 'nonbrand')} onClick={() => onChange('nonbrand')}>Non-brand</button>
  </div>;
}

// ---------------------------------------------------------------- main
export function SearchConsole() {
  const isAdmin = useIsSuperAdmin();
  const [sites, setSites] = useState<Site[] | null>(null);
  const [site, setSite] = useState('');
  const [view, setView] = useState<View>('performance');
  const [range, setRange] = useState<DateRange>(() => { const r = presetRange('last28'); return r ? { ...r, preset: 'last28' } : null; });
  const [trend, setTrend] = useState<Trend[] | null>(null);
  const [brandVersion, setBrandVersion] = useState(0); // bump after brand settings change

  const loadSites = useCallback(() => supabase.from('gsc_sites').select('site_url, backfill_cursor, recent_synced_at, last_error, brand_terms, brand_fuzzy').eq('enabled', true).order('site_url')
    .then(({ data }) => { const list = (data ?? []) as Site[]; setSites(list); setSite(s => s && list.some(x => x.site_url === s) ? s : list[0]?.site_url ?? ''); }), []);
  useEffect(() => { loadSites(); }, [loadSites]);
  useEffect(() => {
    if (!site) return;
    setTrend(null);
    supabase.rpc('gsc_trend', { p_site: site, p_start: ALL.start, p_end: ALL.end }).then(({ data }) => setTrend((data ?? []) as Trend[]));
  }, [site]);

  const span: Span = range ?? ALL;
  const current = sites?.find(s => s.site_url === site);

  if (sites === null) return <div className="state-panel"><Loader2 size={18} className="auth-spin" /><p>Getting your Search Console sites…</p></div>;
  if (!sites.length) return <section className="state-panel"><span className="state-icon"><Search size={20} /></span><h3>No Search Console sites yet</h3><p>Add the service account as a user on a Search Console property. It will show up here after the next sync (every 10 minutes).</p></section>;

  return <section className="threads-monitor">
    <nav className="threads-subnav" aria-label="Search Console sections">
      <button className={view === 'performance' ? 'active' : ''} onClick={() => setView('performance')}><BarChart3 size={14} />Performance</button>
      <button className={view === 'gaps' ? 'active' : ''} onClick={() => setView('gaps')}><AlertTriangle size={14} />Content gaps</button>
      <button className={view === 'brand' ? 'active' : ''} onClick={() => setView('brand')}><Tag size={14} />Brand keywords</button>
    </nav>
    <div className="threads-filters">
      <label className="threads-select"><span>Site</span>
        <select value={site} onChange={e => setSite(e.target.value)}>{sites.map(s => <option key={s.site_url} value={s.site_url}>{siteLabel(s.site_url)}</option>)}</select>
      </label>
      <DateRangePicker value={range} onChange={setRange} dataDays={(trend ?? []).map(t => t.date)} />
    </div>
    <p className="threads-meta"><span className="live-dot" />Google Search Console · web search · data until ~1 day ago{current?.backfill_cursor && <> · history from {current.backfill_cursor}</>}{current?.last_error && <> · <span className="text-red-400" title={current.last_error}>last sync error</span></>}</p>

    {view === 'performance' && <PerformanceView key={`${site}-${brandVersion}`} site={site} span={span} trend={trend} />}
    {view === 'gaps' && <GapsView key={`${site}-${brandVersion}`} site={site} span={span} />}
    {view === 'brand' && current && <BrandSettings key={site} site={current} span={span} isAdmin={isAdmin} onSaved={() => { loadSites(); setBrandVersion(v => v + 1); }} />}
  </section>;
}

// ---------------------------------------------------------------- performance
function PerformanceView({ site, span, trend }: { site: string; span: Span; trend: Trend[] | null }) {
  const [group, setGroup] = useState<Group>('query');
  const [brand, setBrand] = useState<Brand>('all');
  const [q, setQ] = useState('');
  const search = useDebounced(q.trim());
  const [sortKey, setSortKey] = useState<SortKey>('clicks');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<TopRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [related, setRelated] = useState<TopRow[] | null>(null);
  const [split, setSplit] = useState<Split[] | null>(null);
  const [exporting, setExporting] = useState(false);

  const baseArgs = useMemo(() => ({ p_site: site, p_start: span.start, p_end: span.end, p_group: group, p_search: search || null, p_brand: brand }), [site, span.start, span.end, group, search, brand]);
  useEffect(() => { setOffset(0); setOpen(null); }, [baseArgs, sortKey, dir]);
  useEffect(() => {
    let cancelled = false;
    setRows(null); setError(null);
    rpc<TopRow>('gsc_report', { ...baseArgs, p_sort: sortKey, p_dir: dir, p_limit: PAGE, p_offset: offset })
      .then(r => { if (!cancelled) setRows(r); }).catch(e => { if (!cancelled) setError(e?.message ?? String(e)); });
    return () => { cancelled = true; };
  }, [baseArgs, sortKey, dir, offset]);
  useEffect(() => {
    setSplit(null);
    rpc<Split>('gsc_brand_split', { p_site: site, p_start: span.start, p_end: span.end }).then(setSplit).catch(() => setSplit([]));
  }, [site, span.start, span.end]);
  useEffect(() => {
    if (!open) { setRelated(null); return; }
    let cancelled = false;
    setRelated(null);
    rpc<TopRow>('gsc_report', { p_site: site, p_start: span.start, p_end: span.end, p_group: group === 'query' ? 'page' : 'query', p_filter_query: group === 'query' ? open : null, p_filter_page: group === 'page' ? open : null, p_brand: brand, p_limit: 20 })
      .then(r => { if (!cancelled) setRelated(r); }).catch(() => { if (!cancelled) setRelated([]); });
    return () => { cancelled = true; };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const days = useMemo(() => (trend ?? []).filter(t => t.date >= span.start && t.date <= span.end), [trend, span.start, span.end]);
  const kpis = useMemo(() => {
    const clicks = days.reduce((s, d) => s + Number(d.clicks), 0);
    const impressions = days.reduce((s, d) => s + Number(d.impressions), 0);
    const posW = days.reduce((s, d) => s + (d.avg_position ?? 0) * Number(d.impressions), 0);
    return { clicks, impressions, ctr: impressions ? clicks / impressions : 0, position: impressions ? posW / impressions : null };
  }, [days]);
  const chart = useMemo(() => days.length ? lineOption({
    labels: days.map(d => d.date.slice(5)), values: days.map(d => Number(d.clicks)), color: theme.blue,
    tooltipText: i => `${days[i].date}<br/><b style="font-family:${theme.mono}">${fmt(days[i].clicks)}</b> clicks · ${fmt(days[i].impressions)} impressions<br/>CTR ${pct(days[i].ctr)} · pos ${pos(days[i].avg_position)}`,
  }) : null, [days]);
  const splitView = useMemo(() => {
    if (!split) return null;
    const b = split.find(s => s.segment === 'brand') ?? { clicks: 0, impressions: 0, queries: 0 };
    const n = split.find(s => s.segment === 'nonbrand') ?? { clicks: 0, impressions: 0, queries: 0 };
    const tc = Number(b.clicks) + Number(n.clicks), ti = Number(b.impressions) + Number(n.impressions);
    return { b, n, bc: tc ? Number(b.clicks) / tc : 0, bi: ti ? Number(b.impressions) / ti : 0 };
  }, [split]);

  const total = rows?.[0]?.total_count ?? 0;
  const sortBy = (k: SortKey) => { if (sortKey === k) setDir(dir === 'asc' ? 'desc' : 'asc'); else { setSortKey(k); setDir(k === 'position' || k === 'key' ? 'asc' : 'desc'); } };
  const exportCsv = async () => {
    setExporting(true);
    try {
      const all = await rpc<TopRow>('gsc_report', { ...baseArgs, p_sort: sortKey, p_dir: dir, p_limit: 50000, p_offset: 0 });
      downloadCsv(`gsc-${siteLabel(site).replace(/\W+/g, '-')}-${group}-${brand}-${span === ALL ? 'all' : `${span.start}_${span.end}`}.csv`,
        [group, 'clicks', 'impressions', 'ctr', 'avg_position', group === 'query' ? 'pages' : 'queries', ...(group === 'query' ? ['brand'] : [])],
        all.map(r => [r.key, r.clicks, r.impressions, r.ctr.toFixed(4), r.avg_position?.toFixed(2) ?? '', r.related, ...(group === 'query' ? [r.is_brand ? 'brand' : 'non-brand'] : [])]));
    } finally { setExporting(false); }
  };
  const cols: [SortKey, string][] = [['key', group === 'query' ? 'Query' : 'Page'], ['clicks', 'Clicks'], ['impressions', 'Impressions'], ['ctr', 'CTR'], ['position', 'Position']];

  return <>
    <section className="kpi-grid threads-kpis mt-3">
      <StatCard icon={<MousePointerClick />} label="Clicks" value={trend ? fmt(kpis.clicks) : '…'} tint="brand" />
      <StatCard icon={<Eye />} label="Impressions" value={trend ? fmt(kpis.impressions) : '…'} tint="info" />
      <StatCard icon={<Percent />} label="Avg CTR" value={trend ? pct(kpis.ctr) : '…'} />
      <StatCard icon={<Gauge />} label="Avg position" value={trend ? pos(kpis.position) : '…'} hint="Impression-weighted average position" />
    </section>

    <section className="mt-3 grid gap-3 lg:grid-cols-[2fr_1fr]">
      <section className="panel">
        <header className="section-heading"><h2>Clicks per day</h2><span className="muted-action">{days.length} days</span></header>
        {chart ? <EChart option={chart} height={200} ariaLabel="Search clicks per day" /> : <p className="m-0 py-10 text-center text-[13px] text-zinc-500">{trend ? 'No data for this period.' : 'Loading…'}</p>}
      </section>
      <section className="panel">
        <header className="section-heading"><h2>Brand vs non-brand</h2><span className="muted-action">from query data</span></header>
        {!splitView ? <div className="flex justify-center py-10"><Loader2 size={16} className="auth-spin" /></div> : <div className="grid gap-4">
          {([['Clicks', splitView.bc, splitView.b.clicks, splitView.n.clicks], ['Impressions', splitView.bi, splitView.b.impressions, splitView.n.impressions]] as const).map(([label, share, bv, nv]) => <div key={label}>
            <div className="mb-1.5 flex justify-between text-[12px] text-zinc-400"><span>{label}</span><span>{pct0(share)} brand</span></div>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-[#27272a]"><div style={{ width: `${share * 100}%`, background: theme.orange }} /><div style={{ width: `${(1 - share) * 100}%`, background: theme.blue }} /></div>
            <div className="mt-1.5 flex justify-between text-[12px]"><span className="text-[#ff9466]">Brand {fmt(bv)}</span><span className="text-[#8ec8ff]">Non-brand {fmt(nv)}</span></div>
          </div>)}
          <p className="m-0 text-[11.5px] text-zinc-500">{fmt(splitView.b.queries)} brand queries · {fmt(splitView.n.queries)} non-brand. Set the brand keywords in the “Brand keywords” tab.</p>
        </div>}
      </section>
    </section>

    <section className="panel mt-3">
      <div className="threads-filters !pb-3 mb-3">
        <div className="flex flex-wrap gap-1.5">
          <button className={pill(group === 'query')} onClick={() => setGroup('query')}>Queries</button>
          <button className={pill(group === 'page')} onClick={() => setGroup('page')}>Pages</button>
        </div>
        <BrandChips value={brand} onChange={setBrand} />
        <div className="threads-search"><Search size={13} /><input value={q} onChange={e => setQ(e.target.value)} placeholder={group === 'query' ? 'Search query' : 'Search page URL'} /></div>
        <button className="filter-chip ml-auto inline-flex items-center gap-1.5" onClick={exportCsv} disabled={!total || exporting}>{exporting ? <Loader2 size={13} className="auth-spin" /> : <Download size={13} />}Export CSV</button>
      </div>
      <header className="section-heading"><h2>{fmt(total)} {group === 'query' ? 'queries' : 'pages'}{brand !== 'all' && <span className="muted-action">· {brand === 'brand' ? 'brand' : 'non-brand'} queries only</span>}</h2><span className="muted-action">Click a row to see its {group === 'query' ? 'pages' : 'queries'} · totals above include anonymized queries</span></header>
      {error ? <p className="m-0 py-10 text-center text-[13px] text-red-400">Couldn't load data: {error}</p>
        : rows === null ? <div className="flex justify-center py-10"><Loader2 size={18} className="auth-spin" /></div>
        : !rows.length ? <p className="m-0 py-10 text-center text-[13px] text-zinc-500">Nothing matches these filters.</p>
        : <div className="table-scroll"><table>
          <thead><tr>{cols.map(([k, label]) => <th key={k}><button className={sortKey === k ? 'active-sort' : ''} onClick={() => sortBy(k)}>{label}{sortKey === k && (dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}</button></th>)}<th>{group === 'query' ? 'Pages' : 'Queries'}</th></tr></thead>
          <tbody>{rows.map(r => {
            const isOpen = open === r.key;
            return [
              <tr key={r.key} className="cursor-pointer" onClick={() => setOpen(isOpen ? null : r.key)}>
                <td className="max-w-[520px] overflow-hidden text-ellipsis" title={r.key}>
                  <span className="inline-flex items-center gap-1.5">{isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}{group === 'page' ? pathOf(r.key) : r.key}
                    {r.is_brand && <span className="kw-tag">brand</span>}
                    {group === 'page' && <a href={r.key} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-zinc-500 hover:text-zinc-200"><ExternalLink size={12} /></a>}</span>
                </td>
                <td>{fmt(r.clicks)}</td><td>{fmt(r.impressions)}</td><td>{pct(r.ctr)}</td><td>{pos(r.avg_position)}</td><td>{fmt(r.related)}</td>
              </tr>,
              isOpen && <tr key={`${r.key}-rel`}><td colSpan={6} className="!p-0">
                <div className="bg-[#141416] px-6 py-3">{related === null ? <Loader2 size={14} className="auth-spin" /> : <table><tbody>{related.map(x => <tr key={x.key}>
                  <td className="max-w-[480px] overflow-hidden text-ellipsis !text-[12px] !font-normal" title={x.key}>{group === 'query' ? <a href={x.key} target="_blank" rel="noreferrer" className="hover:underline">{pathOf(x.key)}</a> : x.key}</td>
                  <td>{fmt(x.clicks)} clicks</td><td>{fmt(x.impressions)} impr.</td><td>{pct(x.ctr)}</td><td>pos {pos(x.avg_position)}</td></tr>)}</tbody></table>}</div>
              </td></tr>,
            ];
          })}</tbody>
        </table></div>}
      <Pager offset={offset} total={total} setOffset={setOffset} />
    </section>
  </>;
}

// ---------------------------------------------------------------- content gaps
function GapsView({ site, span }: { site: string; span: Span }) {
  const [issue, setIssue] = useState<string>('mismatch');
  const [brand, setBrand] = useState<Brand>('nonbrand');
  const [minImpr, setMinImpr] = useState('10');
  const [q, setQ] = useState('');
  const search = useDebounced(q.trim());
  const minI = useDebounced(Math.max(0, parseInt(minImpr, 10) || 0));
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<GapRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [pages, setPages] = useState<TopRow[] | null>(null);
  const [exporting, setExporting] = useState(false);

  const args = useMemo(() => ({ p_site: site, p_start: span.start, p_end: span.end, p_brand: brand, p_issue: issue, p_min_impr: minI, p_search: search || null }), [site, span.start, span.end, brand, issue, minI, search]);
  useEffect(() => { setOffset(0); setOpen(null); }, [args]);
  useEffect(() => {
    let cancelled = false;
    setRows(null); setError(null);
    rpc<GapRow>('gsc_gaps', { ...args, p_limit: PAGE, p_offset: offset })
      .then(r => { if (!cancelled) setRows(r); }).catch(e => { if (!cancelled) setError(e?.message ?? String(e)); });
    return () => { cancelled = true; };
  }, [args, offset]);
  useEffect(() => {
    if (!open) { setPages(null); return; }
    let cancelled = false;
    setPages(null);
    rpc<TopRow>('gsc_report', { p_site: site, p_start: span.start, p_end: span.end, p_group: 'page', p_filter_query: open, p_sort: 'impressions', p_limit: 20 })
      .then(r => { if (!cancelled) setPages(r); }).catch(() => { if (!cancelled) setPages([]); });
    return () => { cancelled = true; };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = rows?.[0]?.total_count ?? 0;
  const exportCsv = async () => {
    setExporting(true);
    try {
      const all = await rpc<GapRow>('gsc_gaps', { ...args, p_limit: 50000, p_offset: 0 });
      downloadCsv(`gsc-gaps-${siteLabel(site).replace(/\W+/g, '-')}-${issue}-${span === ALL ? 'all' : `${span.start}_${span.end}`}.csv`,
        ['query', 'impressions', 'clicks', 'ctr', 'avg_position', 'issues', 'top_page', 'top_share', 'second_page', 'second_share', 'pages', 'url_match'],
        all.map(r => [r.query, r.impressions, r.clicks, r.ctr.toFixed(4), r.avg_position?.toFixed(2) ?? '', r.issues.map(i => ISSUES[i]?.label ?? i), r.top_page, r.top_share.toFixed(2), r.second_page ?? '', r.second_share.toFixed(2), r.pages, r.match_score == null ? '' : r.match_score.toFixed(2)]));
    } finally { setExporting(false); }
  };

  return <>
    <section className="panel mt-3">
      <div className="threads-filters !pb-3 mb-3">
        <div className="flex flex-wrap gap-1.5">
          {(['mismatch', 'homepage', 'cannibal', 'noclick', 'all'] as const).map(k => <button key={k} className={pill(issue === k)} onClick={() => setIssue(k)} title={ISSUES[k]?.help}>{k === 'all' ? 'All issues' : ISSUES[k].label}</button>)}
        </div>
        <BrandChips value={brand} onChange={setBrand} />
        <label className="threads-select"><span>Min. impressions</span><input className="w-16 bg-transparent text-[12.5px] text-zinc-50 outline-none" value={minImpr} onChange={e => setMinImpr(e.target.value.replace(/\D/g, ''))} inputMode="numeric" /></label>
        <div className="threads-search"><Search size={13} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search query" /></div>
        <button className="filter-chip ml-auto inline-flex items-center gap-1.5" onClick={exportCsv} disabled={!total || exporting}>{exporting ? <Loader2 size={13} className="auth-spin" /> : <Download size={13} />}Export CSV</button>
      </div>
      <p className="m-0 mb-4 text-[12px] leading-relaxed text-zinc-400">{issue === 'all' ? 'Queries with at least one issue below.' : ISSUES[issue].help}{' '}Queries that get impressions always land on some page in Search Console — “mismatch” means that page doesn't really fit the query, which is usually a sign a dedicated article or landing page is missing.</p>
      <header className="section-heading"><h2>{fmt(total)} queries</h2><span className="muted-action">Sorted by impressions · click a row to see every page that showed up</span></header>
      {error ? <p className="m-0 py-10 text-center text-[13px] text-red-400">Couldn't load data: {error}</p>
        : rows === null ? <div className="flex justify-center py-10"><Loader2 size={18} className="auth-spin" /></div>
        : !rows.length ? <p className="m-0 py-10 text-center text-[13px] text-zinc-500">No queries with this issue in the selected period.</p>
        : <div className="table-scroll"><table>
          <thead><tr><th>Query</th><th>Impressions</th><th>Clicks</th><th>Position</th><th>Page that ranks</th><th title="Share of query words found in the page URL">URL match</th><th>Pages</th></tr></thead>
          <tbody>{rows.map(r => {
            const isOpen = open === r.query;
            return [
              <tr key={r.query} className="cursor-pointer" onClick={() => setOpen(isOpen ? null : r.query)}>
                <td className="max-w-[360px]" title={r.query}>
                  <div className="flex items-center gap-1.5 overflow-hidden text-ellipsis">{isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}<span className="overflow-hidden text-ellipsis">{r.query}</span>{r.is_brand && <span className="kw-tag">brand</span>}</div>
                  <div className="mt-1 flex flex-wrap gap-1 pl-[19px]">{r.issues.map(i => <span key={i} className={`status-pill ${ISSUES[i]?.cls ?? 'off'}`} title={ISSUES[i]?.help}>{ISSUES[i]?.label ?? i}</span>)}</div>
                </td>
                <td>{fmt(r.impressions)}</td><td>{fmt(r.clicks)}</td><td>{pos(r.avg_position)}</td>
                <td className="max-w-[340px] overflow-hidden text-ellipsis !text-[12px]" title={r.top_page}>
                  <a href={r.top_page} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="hover:underline">{pathOf(r.top_page)}</a> <span className="text-zinc-500">{pct0(r.top_share)}</span>
                  {r.second_page && r.second_share >= 0.2 && <div className="overflow-hidden text-ellipsis text-zinc-500" title={r.second_page}>+ {pathOf(r.second_page)} {pct0(r.second_share)}</div>}
                </td>
                <td>{r.match_score == null ? '–' : <span className={r.match_score < 0.5 ? 'text-[#ff8f86]' : 'text-[#8eeab0]'}>{pct0(r.match_score)}</span>}</td>
                <td>{fmt(r.pages)}</td>
              </tr>,
              isOpen && <tr key={`${r.query}-pages`}><td colSpan={7} className="!p-0">
                <div className="bg-[#141416] px-6 py-3">{pages === null ? <Loader2 size={14} className="auth-spin" /> : <table><tbody>{pages.map(x => <tr key={x.key}>
                  <td className="max-w-[480px] overflow-hidden text-ellipsis !text-[12px] !font-normal" title={x.key}><a href={x.key} target="_blank" rel="noreferrer" className="hover:underline">{pathOf(x.key)}</a></td>
                  <td>{fmt(x.impressions)} impr.</td><td>{fmt(x.clicks)} clicks</td><td>pos {pos(x.avg_position)}</td></tr>)}</tbody></table>}</div>
              </td></tr>,
            ];
          })}</tbody>
        </table></div>}
      <Pager offset={offset} total={total} setOffset={setOffset} />
    </section>
  </>;
}

// ---------------------------------------------------------------- brand settings
type Preview = { query: string; impressions: number; clicks: number; matched: boolean; distance: number | null };
function BrandSettings({ site, span, isAdmin, onSaved }: { site: Site; span: Span; isAdmin: boolean; onSaved: () => void }) {
  const fallback = useMemo(() => [siteLabel(site.site_url).replace(/^www\./, '').split('.')[0]], [site.site_url]);
  const [terms, setTerms] = useState<string[]>(site.brand_terms?.length ? site.brand_terms : fallback);
  const [fuzzy, setFuzzy] = useState(site.brand_fuzzy ?? true);
  const [input, setInput] = useState('');
  const [preview, setPreview] = useState<Preview[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const dTerms = useDebounced(terms, 400);
  const dFuzzy = useDebounced(fuzzy, 200);

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    rpc<Preview>('gsc_brand_preview', { p_site: site.site_url, p_start: span.start, p_end: span.end, p_terms: dTerms, p_fuzzy: dFuzzy })
      .then(r => { if (!cancelled) setPreview(r); }).catch(() => { if (!cancelled) setPreview([]); });
    return () => { cancelled = true; };
  }, [site.site_url, span.start, span.end, dTerms, dFuzzy]);

  const addTerms = (raw: string) => {
    const next = raw.split(/[,\n]/).map(t => t.trim().toLowerCase()).filter(Boolean);
    if (next.length) setTerms(t => [...new Set([...t, ...next])]);
    setInput('');
  };
  const save = async () => {
    setSaving(true); setMsg(null);
    const { error } = await supabase.from('gsc_sites').update({ brand_terms: terms, brand_fuzzy: fuzzy }).eq('site_url', site.site_url);
    setSaving(false);
    if (error) { setMsg(`Couldn't save: ${error.message}`); return; }
    setMsg('Saved — brand / non-brand numbers now use these keywords.');
    onSaved();
  };

  const matched = (preview ?? []).filter(p => p.matched);
  const similar = (preview ?? []).filter(p => !p.matched);
  const dirty = JSON.stringify(terms) !== JSON.stringify(site.brand_terms?.length ? site.brand_terms : fallback) || fuzzy !== (site.brand_fuzzy ?? true);

  return <section className="mt-3 grid gap-3 lg:grid-cols-[1fr_1.4fr]">
    <section className="panel">
      <header className="section-heading"><h2><Settings2 size={15} />Brand keywords · {siteLabel(site.site_url)}</h2></header>
      <p className="m-0 mb-3 text-[12px] leading-relaxed text-zinc-400">A query counts as <b className="text-zinc-200">brand</b> when it contains one of these keywords (spaces ignored, so “dam essa” matches too). With typo matching on, close misspellings also count — e.g. “damesa” or “dmesa” for “damessa”.{!site.brand_terms?.length && ' Not set yet — using the domain name by default.'}</p>
      <div className="mb-3 flex flex-wrap gap-1.5">{terms.map(t => <span key={t} className="filter-chip active inline-flex items-center gap-1">{t}{isAdmin && <button aria-label={`Remove ${t}`} className="opacity-70 hover:opacity-100" onClick={() => setTerms(terms.filter(x => x !== t))}><X size={12} /></button>}</span>)}{!terms.length && <span className="text-[12px] text-zinc-500">No keywords — every query counts as non-brand.</span>}</div>
      {isAdmin ? <div className="topic-form !mb-0">
        <label>Add keywords<input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTerms(input); } }} placeholder="e.g. damessa, damessa dental, dmesa — press Enter" /></label>
        <small>Separate several keywords with commas. Typo matching only applies to keywords of 4+ letters (1 typo up to 6 letters, 2 typos for longer words).</small>
        <label className="check"><input type="checkbox" checked={fuzzy} onChange={e => setFuzzy(e.target.checked)} />Also match typos (fuzzy)</label>
        <div className="flex items-center gap-2"><button className="state-btn !mt-0" onClick={save} disabled={saving || !dirty}>{saving && <Loader2 size={14} className="auth-spin" />}Save</button>{msg && <span className="text-[12px] text-zinc-400">{msg}</span>}</div>
      </div> : <p className="m-0 text-[12px] text-zinc-500">Only a super admin can change the brand keywords. Typo matching is {fuzzy ? 'on' : 'off'}.</p>}
    </section>
    <section className="panel">
      <header className="section-heading"><h2>Preview</h2><span className="muted-action">for the selected period · updates as you edit</span></header>
      {preview === null ? <div className="flex justify-center py-10"><Loader2 size={18} className="auth-spin" /></div> : <div className="grid gap-5">
        <div>
          <h3 className="m-0 mb-2 text-[12px] font-medium uppercase tracking-[.1em] text-zinc-500">Counted as brand ({fmt(matched.length)}{matched.length >= 200 ? '+' : ''})</h3>
          {!matched.length ? <p className="m-0 text-[12px] text-zinc-500">No query matches yet.</p> : <div className="max-h-[300px] overflow-auto"><table><tbody>{matched.slice(0, 100).map(p => <tr key={p.query}><td className="!text-[12.5px] !font-normal">{p.query}{p.distance ? <span className="kw-tag ml-1.5" title="Matched by typo tolerance">typo</span> : null}</td><td>{fmt(p.impressions)} impr.</td><td>{fmt(p.clicks)} clicks</td></tr>)}</tbody></table></div>}
        </div>
        <div>
          <h3 className="m-0 mb-2 text-[12px] font-medium uppercase tracking-[.1em] text-zinc-500">Looks similar, not counted ({fmt(similar.length)})</h3>
          {!similar.length ? <p className="m-0 text-[12px] text-zinc-500">Nothing similar found.</p> : <div className="max-h-[260px] overflow-auto"><table><tbody>{similar.slice(0, 100).map(p => <tr key={p.query}><td className="!text-[12.5px] !font-normal">{p.query}</td><td>{fmt(p.impressions)} impr.</td><td>{isAdmin && <button className="filter-chip inline-flex items-center gap-1" onClick={() => addTerms(closestWord(p.query, terms))}><Plus size={12} />Add “{closestWord(p.query, terms)}”</button>}</td></tr>)}</tbody></table></div>}
        </div>
      </div>}
    </section>
  </section>;
}
