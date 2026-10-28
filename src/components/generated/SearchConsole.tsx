import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, Download, ExternalLink, Eye, Gauge, Loader2, MousePointerClick, Percent, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { DateRangePicker, presetRange, type DateRange } from './DateRangePicker';
import { StatCard } from '../StatCard';
import { EChart } from '../charts/EChart';
import { lineOption, theme } from '../charts/options';

type Site = { site_url: string; backfill_cursor: string | null; recent_synced_at: string | null; last_error: string | null };
type Trend = { date: string; clicks: number; impressions: number; ctr: number; avg_position: number | null };
type TopRow = { key: string; clicks: number; impressions: number; ctr: number; avg_position: number | null; related: number; total_count: number };
type Group = 'query' | 'page';
type SortKey = 'key' | 'clicks' | 'impressions' | 'ctr' | 'position';

const PAGE = 50;
const ALL = { start: '2000-01-01', end: '2100-01-01' };
const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString('en-US');
const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
const pos = (n: number | null) => (n == null ? '–' : n.toFixed(1));
const siteLabel = (s: string) => s.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '').replace(/\/$/, '');

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

async function fetchTop(args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc('gsc_top', args);
  if (error) throw error;
  return (data ?? []) as TopRow[];
}

export function SearchConsole() {
  const [sites, setSites] = useState<Site[] | null>(null);
  const [site, setSite] = useState('');
  const [range, setRange] = useState<DateRange>(() => { const r = presetRange('last28'); return r ? { ...r, preset: 'last28' } : null; });
  const [trend, setTrend] = useState<Trend[] | null>(null);
  const [group, setGroup] = useState<Group>('query');
  const [q, setQ] = useState('');
  const search = useDebounced(q.trim());
  const [sortKey, setSortKey] = useState<SortKey>('clicks');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<TopRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [related, setRelated] = useState<TopRow[] | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    supabase.from('gsc_sites').select('site_url, backfill_cursor, recent_synced_at, last_error').eq('enabled', true).order('site_url')
      .then(({ data }) => { const list = (data ?? []) as Site[]; setSites(list); if (list[0]) setSite(list[0].site_url); });
  }, []);

  // All-time daily trend for the site (small: one row per day) — KPIs and chart are filtered client-side
  useEffect(() => {
    if (!site) return;
    setTrend(null);
    supabase.rpc('gsc_trend', { p_site: site, p_start: ALL.start, p_end: ALL.end }).then(({ data }) => setTrend((data ?? []) as Trend[]));
  }, [site]);

  const span = range ?? ALL;
  const baseArgs = useMemo(() => ({ p_site: site, p_start: span.start, p_end: span.end, p_group: group, p_search: search || null }), [site, span.start, span.end, group, search]);

  useEffect(() => { setOffset(0); setOpen(null); }, [baseArgs, sortKey, dir]);
  useEffect(() => {
    if (!site) return;
    let cancelled = false;
    setRows(null); setError(null);
    fetchTop({ ...baseArgs, p_sort: sortKey, p_dir: dir, p_limit: PAGE, p_offset: offset })
      .then(r => { if (!cancelled) setRows(r); })
      .catch(e => { if (!cancelled) setError(e?.message ?? String(e)); });
    return () => { cancelled = true; };
  }, [baseArgs, sortKey, dir, offset, site]);

  // Drill-down: pages for a query, or queries for a page
  useEffect(() => {
    if (!open) { setRelated(null); return; }
    let cancelled = false;
    setRelated(null);
    fetchTop({ p_site: site, p_start: span.start, p_end: span.end, p_group: group === 'query' ? 'page' : 'query', p_filter_query: group === 'query' ? open : null, p_filter_page: group === 'page' ? open : null, p_limit: 20 })
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
    labels: days.map(d => d.date.slice(5)),
    values: days.map(d => Number(d.clicks)),
    color: theme.blue,
    tooltipText: i => `${days[i].date}<br/><b style="font-family:${theme.mono}">${fmt(days[i].clicks)}</b> clicks · ${fmt(days[i].impressions)} impressions<br/>CTR ${pct(days[i].ctr)} · pos ${pos(days[i].avg_position)}`,
  }) : null, [days]);

  const total = rows?.[0]?.total_count ?? 0;
  const sortBy = (k: SortKey) => { if (sortKey === k) setDir(dir === 'asc' ? 'desc' : 'asc'); else { setSortKey(k); setDir(k === 'position' || k === 'key' ? 'asc' : 'desc'); } };
  const current = sites?.find(s => s.site_url === site);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const all = await fetchTop({ ...baseArgs, p_sort: sortKey, p_dir: dir, p_limit: 50000, p_offset: 0 });
      const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      const head = [group, 'clicks', 'impressions', 'ctr', 'avg_position', group === 'query' ? 'pages' : 'queries'];
      const csv = [head.join(','), ...all.map(r => [r.key, r.clicks, r.impressions, r.ctr.toFixed(4), r.avg_position?.toFixed(2) ?? '', r.related].map(esc).join(','))].join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
      a.download = `gsc-${siteLabel(site).replace(/\W+/g, '-')}-${group}-${span === ALL ? 'all' : `${span.start}_${span.end}`}.csv`;
      a.click(); URL.revokeObjectURL(a.href);
    } finally { setExporting(false); }
  };

  const pill = (on: boolean) => `filter-chip ${on ? 'active' : ''}`;
  const cols: [SortKey, string][] = [['key', group === 'query' ? 'Query' : 'Page'], ['clicks', 'Clicks'], ['impressions', 'Impressions'], ['ctr', 'CTR'], ['position', 'Position']];

  if (sites === null) return <div className="state-panel"><Loader2 size={18} className="auth-spin" /><p>Getting your Search Console sites…</p></div>;
  if (!sites.length) return <section className="state-panel"><span className="state-icon"><Search size={20} /></span><h3>No Search Console sites yet</h3><p>Add the service account as a user on a Search Console property. It will show up here after the next sync (every 10 minutes).</p></section>;

  return <section className="threads-monitor">
    <div className="threads-filters">
      <label className="threads-select"><span>Site</span>
        <select value={site} onChange={e => setSite(e.target.value)}>{sites.map(s => <option key={s.site_url} value={s.site_url}>{siteLabel(s.site_url)}</option>)}</select>
      </label>
      <DateRangePicker value={range} onChange={setRange} dataDays={(trend ?? []).map(t => t.date)} />
      <div className="flex flex-wrap gap-1.5">
        <button className={pill(group === 'query')} onClick={() => setGroup('query')}>Queries</button>
        <button className={pill(group === 'page')} onClick={() => setGroup('page')}>Pages</button>
      </div>
      <div className="threads-search"><Search size={13} /><input value={q} onChange={e => setQ(e.target.value)} placeholder={group === 'query' ? 'Search query' : 'Search page URL'} /></div>
      <button className="filter-chip ml-auto inline-flex items-center gap-1.5" onClick={exportCsv} disabled={!total || exporting}>{exporting ? <Loader2 size={13} className="auth-spin" /> : <Download size={13} />}Export CSV</button>
    </div>
    <p className="threads-meta"><span className="live-dot" />Google Search Console · web search · data until ~2 days ago{current?.backfill_cursor && <> · history from {current.backfill_cursor}</>}{current?.last_error && <> · <span className="text-red-400" title={current.last_error}>last sync error</span></>}</p>

    <section className="kpi-grid threads-kpis">
      <StatCard icon={<MousePointerClick />} label="Clicks" value={trend ? fmt(kpis.clicks) : '…'} tint="brand" />
      <StatCard icon={<Eye />} label="Impressions" value={trend ? fmt(kpis.impressions) : '…'} tint="info" />
      <StatCard icon={<Percent />} label="Avg CTR" value={trend ? pct(kpis.ctr) : '…'} />
      <StatCard icon={<Gauge />} label="Avg position" value={trend ? pos(kpis.position) : '…'} hint="Impression-weighted average position" />
    </section>

    <section className="panel mt-3">
      <header className="section-heading"><h2>Clicks per day</h2><span className="muted-action">{days.length} days</span></header>
      {chart ? <EChart option={chart} height={200} ariaLabel="Search clicks per day" /> : <p className="m-0 py-10 text-center text-[13px] text-zinc-500">{trend ? 'No data for this period.' : 'Loading…'}</p>}
    </section>

    <section className="panel mt-3">
      <header className="section-heading"><h2>{fmt(total)} {group === 'query' ? 'queries' : 'pages'}</h2><span className="muted-action">Click a row to see its {group === 'query' ? 'pages' : 'queries'} · totals above include anonymized queries</span></header>
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
                  <span className="inline-flex items-center gap-1.5">{isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}{group === 'page' ? siteLabel(r.key) : r.key}
                    {group === 'page' && <a href={r.key} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-zinc-500 hover:text-zinc-200"><ExternalLink size={12} /></a>}</span>
                </td>
                <td>{fmt(r.clicks)}</td><td>{fmt(r.impressions)}</td><td>{pct(r.ctr)}</td><td>{pos(r.avg_position)}</td><td>{fmt(r.related)}</td>
              </tr>,
              isOpen && <tr key={`${r.key}-rel`}><td colSpan={6} className="!p-0">
                <div className="bg-[#141416] px-6 py-3">{related === null ? <Loader2 size={14} className="auth-spin" /> : <table><tbody>{related.map(x => <tr key={x.key}>
                  <td className="max-w-[480px] overflow-hidden text-ellipsis !text-[12px] !font-normal" title={x.key}>{group === 'query' ? <a href={x.key} target="_blank" rel="noreferrer" className="hover:underline">{siteLabel(x.key)}</a> : x.key}</td>
                  <td>{fmt(x.clicks)} clicks</td><td>{fmt(x.impressions)} impr.</td><td>{pct(x.ctr)}</td><td>pos {pos(x.avg_position)}</td></tr>)}</tbody></table>}</div>
              </td></tr>,
            ];
          })}</tbody>
        </table></div>}
      {total > PAGE && <div className="flex items-center justify-center gap-3 pt-4 text-[12px] text-zinc-400">
        <button className="filter-chip inline-flex items-center gap-1" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}><ChevronLeft size={13} />Prev</button>
        <span>{fmt(offset + 1)}–{fmt(Math.min(offset + PAGE, total))} of {fmt(total)}</span>
        <button className="filter-chip inline-flex items-center gap-1" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>Next<ChevronRight size={13} /></button>
      </div>}
    </section>
  </section>;
}
