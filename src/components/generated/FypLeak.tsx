import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Flame, Search, Music2, AtSign, Users, Star, ExternalLink, Loader2, Radar, ChevronDown, ChevronRight, Zap, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { StatCard } from '../StatCard';
import { EChart } from '../charts/EChart';
import { hBarOption, theme } from '../charts/options';
import { DateRangePicker, fmtRange, type DateRange } from './DateRangePicker';
import type { EChartsCoreOption } from 'echarts/core';

// ---------- types ----------
type Run = { id: string; started_at: string; finished_at: string | null; sources: string[]; status: string; summary: string | null; notes: string | null };
type Sample = { url?: string; title?: string; meta?: string; author?: string; ago?: string; views?: string; likes?: string; comments?: string; saves?: string; caption?: string; sound?: string; hashtags?: string[]; text?: string; metrics?: string; user?: string };
type Signal = {
  id: number; run_id: string; captured_at: string; source: 'google_trends' | 'tiktok' | 'x'; feed: '4h' | '24h' | 'trending' | 'for_you';
  rank: number | null; title: string; volume_text: string | null; volume_num: number | null; growth_text: string | null; started_text: string | null; status_text: string | null;
  category: string | null; is_organic: boolean | null; organic_reason: string | null; related_terms: string[]; context: string | null; samples: Sample[];
  seen?: number; first_seen?: string; // set when several snapshots are merged
};
type Post = {
  account_handle: string; post_url: string | null; content_type: string; post_category: string; caption: string | null; published_at: string; created_at: string;
  likes: number | null; comments: number | null; views: number | null; likes_hidden: boolean | null; viral_category: string | null; primary_trigger: string | null;
};
type FeedPost = Post & { src: 'HM' | 'KOL'; lift: number; perHour: number; ageH: number; breakout: boolean };
type Tab = 'radar' | 'ig' | 'gt' | 'tt' | 'x';

// ---------- helpers ----------
const fmt = (n: number | null | undefined) => n == null ? '–' : n.toLocaleString('en-US');
const compact = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(Math.round(n));
const wib = (iso: string) => new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const ago = (iso: string) => { const h = (Date.now() - Date.parse(iso)) / 36e5; return h < 1 ? `${Math.max(1, Math.round(h * 60))} mnt lalu` : h < 48 ? `${Math.round(h)} jam lalu` : `${Math.round(h / 24)} hari lalu`; };
const median = (xs: number[]) => { if (!xs.length) return 0; const v = [...xs].sort((a, b) => a - b); const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };

const STOP = new Set(('yang dan di ke dari untuk dengan ini itu ada pada akan atau juga tidak bisa dalam sudah saat jadi oleh karena para lagi baru soal hari jam kata usai vs the and for with from you are this that was how what new live 2025 2026 indonesia trending '
  + 'league liga champions premier final series film episode video viral berita news crash prices price match laga menang kalah hasil jadwal klasemen standings official resmi digelar diumumkan umumkan menayangkan tayang moment momen trip time today people best great').split(' '));
const tokens = (s: string) => new Set((s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s#]/g, ' ').match(/[a-z0-9#]{4,}/g) ?? []).map(t => t.replace(/^#/, '')).filter(t => !STOP.has(t)));
const signalTokens = (s: Signal) => tokens([s.title, ...(s.related_terms ?? [])].join(' '));

async function fetchAll<T>(table: string, columns: string, filter?: (q: any) => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(table).select(columns);
    if (filter) q = filter(q);
    const { data, error } = await q.range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const POST_COLS = 'account_handle,post_url,content_type,post_category,caption,published_at,created_at,likes,comments,views,likes_hidden,viral_category,primary_trigger';

/** HM + KOL posts published in [from, to], scored against each account's own baseline (lift) and likes/hour at capture. */
function scorePosts(posts: Post[], src: 'HM' | 'KOL', from: number, to: number): { latestCapture: string | null; feed: FeedPost[] } {
  if (!posts.length) return { latestCapture: null, feed: [] };
  const byAcc = new Map<string, Post[]>();
  posts.forEach(p => { if (!byAcc.has(p.account_handle)) byAcc.set(p.account_handle, []); byAcc.get(p.account_handle)!.push(p); });
  const perHour = (p: Post) => (p.likes ?? 0) / Math.max(1, (Date.parse(p.created_at) - Date.parse(p.published_at)) / 36e5);
  const base = new Map<string, { likes: number; ph: number }>();
  byAcc.forEach((ps, h) => { const v = ps.filter(p => !p.likes_hidden && p.likes != null); base.set(h, { likes: median(v.map(p => p.likes!)), ph: median(v.map(perHour)) }); });
  const inWin = posts.filter(p => { const t = Date.parse(p.published_at); return t >= from && t <= to; });
  const latestCapture = inWin.length ? inWin.reduce((m, p) => p.created_at > m ? p.created_at : m, inWin[0].created_at) : null;
  const feed = inWin.filter(p => !p.likes_hidden && p.post_category !== 'Sponsored Post').map(p => {
    const b = base.get(p.account_handle)!;
    const lift = b.likes ? (p.likes ?? 0) / b.likes : 0;
    const ph = perHour(p);
    return { ...p, src, lift, perHour: ph, ageH: (Date.parse(p.created_at) - Date.parse(p.published_at)) / 36e5, breakout: lift >= 3 || (lift >= 1.5 && b.ph > 0 && ph >= 3 * b.ph) };
  });
  return { latestCapture, feed };
}

const WIB_MS = 7 * 36e5;
const wibDay = (iso: string) => new Date(Date.parse(iso) + WIB_MS).toISOString().slice(0, 10);
const dayStart = (k: string) => Date.parse(`${k}T00:00:00Z`) - WIB_MS;
const dayEnd = (k: string) => dayStart(k) + 864e5 - 1;

/** Radar axes: each feed is one spoke. */
const AXES: { key: string; label: string; match: (s: Signal) => boolean }[] = [
  { key: 'gt4', label: 'Google 4h', match: s => s.source === 'google_trends' && s.feed === '4h' },
  { key: 'gt24', label: 'Google 24h', match: s => s.source === 'google_trends' && s.feed === '24h' },
  { key: 'tt', label: 'TikTok', match: s => s.source === 'tiktok' },
  { key: 'xt', label: 'X Trending', match: s => s.source === 'x' && s.feed === 'trending' },
  { key: 'xf', label: 'X For you', match: s => s.source === 'x' && s.feed === 'for_you' },
];
type RadarItem = { s: Signal; hits: Map<string, Signal[]>; ig: FeedPost[]; sources: number; axes: number[] };

// ---------- main ----------
export function FypLeak() {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [range, setRange] = useState<DateRange>(null);
  const [pick, setPick] = useState<string>('');            // run id, or 'all' = merge every snapshot in the range
  const [signals, setSignals] = useState<Signal[] | null>(null);
  const [hm, setHm] = useState<Post[] | null>(null);
  const [kol, setKol] = useState<Post[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('radar');
  const [windowH, setWindowH] = useState(24);

  useEffect(() => {
    supabase.from('fyp_runs').select('*').order('started_at', { ascending: false }).limit(1000).then(({ data, error }) => {
      if (error) { setError(error.message); return; }
      setRuns((data ?? []) as Run[]);
    });
    fetchAll<Post>('ig_posts', POST_COLS).then(setHm).catch(e => setError(e.message));
    fetchAll<Post>('kol_posts', POST_COLS).then(setKol).catch(e => setError(e.message));
  }, []);

  const runDays = useMemo(() => [...new Set((runs ?? []).map(r => wibDay(r.started_at)))], [runs]);
  const inRange = useMemo(() => (runs ?? []).filter(r => !range || (wibDay(r.started_at) >= range.start && wibDay(r.started_at) <= range.end)), [runs, range]);
  // When the period changes, jump to its newest snapshot.
  useEffect(() => { if (runs) setPick(inRange[0]?.id ?? ''); }, [inRange, runs]);
  const picked = useMemo(() => pick === 'all' ? inRange : inRange.filter(r => r.id === pick), [pick, inRange]);

  useEffect(() => {
    if (!picked.length) { setSignals(runs ? [] : null); return; }
    let cancelled = false;
    setSignals(null);
    const ids = picked.map(r => r.id);
    fetchAll<Signal>('fyp_signals', '*', q => q.in('run_id', ids).order('captured_at', { ascending: false }).order('rank')).then(rows => {
      if (cancelled) return;
      if (ids.length === 1) { setSignals(rows); return; }
      // Merge snapshots: one row per source/feed/title, newest version wins; remember how often it showed up.
      const m = new Map<string, Signal>();
      rows.forEach(r => {
        const k = `${r.source}|${r.feed}|${r.title.toLowerCase().trim()}`;
        const cur = m.get(k);
        if (!cur) m.set(k, { ...r, seen: 1, first_seen: r.captured_at });
        else { cur.seen = (cur.seen ?? 1) + 1; if (r.captured_at < (cur.first_seen ?? cur.captured_at)) cur.first_seen = r.captured_at; }
      });
      setSignals([...m.values()].sort((a, b) => a.source.localeCompare(b.source) || a.feed.localeCompare(b.feed) || (b.seen ?? 1) - (a.seen ?? 1) || (a.rank ?? 99) - (b.rank ?? 99)));
    }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [picked, runs]);

  const latestRun = picked[0] ?? null;
  // IG window: single snapshot → the N hours before it was collected; merged → the whole selected period.
  const [from, to] = useMemo(() => {
    if (range && (pick === 'all' || !latestRun)) return [dayStart(range.start), Math.min(Date.now(), dayEnd(range.end))];
    const anchor = latestRun ? Date.parse(latestRun.started_at) : Date.now();
    return [anchor - windowH * 36e5, anchor];
  }, [pick, range, latestRun, windowH]);
  const hmScore = useMemo(() => hm ? scorePosts(hm, 'HM', from, to) : null, [hm, from, to]);
  const kolScore = useMemo(() => kol ? scorePosts(kol, 'KOL', from, to) : null, [kol, from, to]);
  const igFeed = useMemo(() => [...(hmScore?.feed ?? []), ...(kolScore?.feed ?? [])].sort((a, b) => b.lift - a.lift), [hmScore, kolScore]);
  const sig = signals ?? [];
  const by = (source: Signal['source'], feed?: Signal['feed']) => sig.filter(s => s.source === source && (!feed || s.feed === feed));

  // Cross-source radar: a topic gets stronger the more independent sources mention it.
  // Two items "match" when they share a rare token (seen in few items overall) or at least two tokens.
  const radar = useMemo<RadarItem[]>(() => {
    const pool = sig.filter(s => s.source !== 'x' || s.is_organic !== false);
    const st = new Map(pool.map(s => [s.id, signalTokens(s)]));
    const igTok = igFeed.map(p => ({ p, t: tokens(`${p.caption ?? ''}`) }));
    const df = new Map<string, number>();
    [...st.values(), ...igTok.map(x => x.t)].forEach(t => t.forEach(w => df.set(w, (df.get(w) ?? 0) + 1)));
    const matches = (a: Set<string>, b: Set<string>) => { const shared = [...a].filter(w => b.has(w)); return shared.length >= 2 || shared.some(w => w.length >= 5 && (df.get(w) ?? 0) <= 6); };
    const feedSize = AXES.map(a => Math.max(1, pool.filter(a.match).length));
    const items = pool.map(s => {
      const t = st.get(s.id)!;
      const hits = new Map<string, Signal[]>();
      const related = [s];
      pool.forEach(o => { if (o.id === s.id || !matches(t, st.get(o.id)!)) return; related.push(o); if (o.source !== s.source) hits.set(o.source, [...(hits.get(o.source) ?? []), o]); });
      const ig = igTok.filter(x => matches(t, x.t)).map(x => x.p);
      const sources = 1 + hits.size + (ig.length ? 1 : 0);
      // spoke value 0–100: best rank of a matching item in that feed (rank 1 = 100)
      const axes = AXES.map((a, i) => { const best = Math.min(...related.filter(a.match).map(o => o.rank ?? feedSize[i])); return Number.isFinite(best) ? Math.max(15, Math.round(100 * (1 - (best - 1) / feedSize[i]))) : 0; });
      axes.push(ig.length ? Math.min(100, 20 + ig.length * 15 + (ig.some(p => p.breakout) ? 25 : 0)) : 0);
      return { s, hits, ig, sources, axes };
    }).filter(x => x.sources >= 2);
    // de-duplicate: keep the best-ranked representative per overlapping cluster
    const seen = new Set<number>();
    return items.sort((a, b) => b.sources - a.sources || (b.ig.length - a.ig.length) || ((a.s.rank ?? 99) - (b.s.rank ?? 99))).filter(x => {
      if (seen.has(x.s.id)) return false;
      seen.add(x.s.id); x.hits.forEach(list => list.forEach(o => seen.add(o.id)));
      return true;
    });
  }, [sig, igFeed]);

  if (error) return <section className="state-panel" role="alert"><h3>We couldn't load The FYP Leak</h3><p>{error}</p></section>;
  if (runs === null) return <div className="state-panel"><Loader2 size={18} className="auth-spin" /><p>Getting the latest signals…</p></div>;

  const tabs: [Tab, string, React.ReactNode][] = [['radar', 'Leak Radar', <Radar size={14} />], ['ig', 'Homeless & KOL', <Users size={14} />], ['gt', 'Google Trends', <Search size={14} />], ['tt', 'TikTok', <Music2 size={14} />], ['x', 'X', <AtSign size={14} />]];
  const breakouts = igFeed.filter(p => p.breakout).length;
  const organicX = by('x').filter(s => s.is_organic).length;
  const merged = pick === 'all' && picked.length > 1;
  const windowLabel = range && (pick === 'all' || !latestRun) ? fmtRange(range.start, range.end) : `${windowH} h before the snapshot`;

  return <section className="fyp-leak">
    <div className="threads-filters">
      <DateRangePicker value={range} onChange={setRange} dataDays={runDays} />
      <label className="threads-select"><span>Snapshot</span>
        <select value={pick} onChange={e => setPick(e.target.value)}>
          {inRange.length === 0 && <option value="">No snapshots in this period</option>}
          {inRange.length > 1 && <option value="all">All {inRange.length} snapshots (merged)</option>}
          {inRange.map(r => <option key={r.id} value={r.id}>{wib(r.started_at)} WIB · {r.status}</option>)}
        </select>
      </label>
      {pick !== 'all' && <label className="threads-select"><span>IG window</span>
        <select value={windowH} onChange={e => setWindowH(+e.target.value)}>{[6, 12, 24, 48, 72].map(h => <option key={h} value={h}>{h} h before snapshot</option>)}</select>
      </label>}
      {latestRun && <p className="threads-meta !m-0"><span className="live-dot" />{merged ? `${picked.length} snapshots merged · newest ${ago(latestRun.started_at)}` : `Collected ${wib(latestRun.started_at)} WIB (${ago(latestRun.started_at)})${latestRun.notes ? ` · ${latestRun.notes}` : ''}`}</p>}
    </div>

    <section className="kpi-grid fyp-kpis">
      <StatCard icon={<Radar size={18} />} label="Cross-source topics" value={radar.length} tint="brand" hint="Topics found in at least two sources (Google Trends, TikTok, X, HM/KOL captions)" />
      <StatCard icon={<Zap size={18} />} label="IG breakouts" value={breakouts} sub={`of ${igFeed.length} HM/KOL posts · ${windowLabel}`} tint="warning" hint="Likes ≥ 3× the account median, or ≥ 1.5× with likes per hour ≥ 3× the account's usual pace" />
      <StatCard icon={<Search size={18} />} label="Google Trends" value={by('google_trends').length} sub={`${by('google_trends', '4h').length} in 4 h · ${by('google_trends', '24h').length} in 24 h`} />
      <StatCard icon={<Music2 size={18} />} label="TikTok topics" value={by('tiktok').length} sub="Indonesia · Creative inspiration" />
      <StatCard icon={<AtSign size={18} />} label="X organic trends" value={organicX} sub={`${by('x').length - organicX} promo/brand removed`} />
      <StatCard icon={<Clock size={18} />} label="IG capture in window" value={hmScore?.latestCapture ? ago(hmScore.latestCapture) : '–'} sub={hmScore?.latestCapture ? `${wib(hmScore.latestCapture)} WIB` : 'No HM posts in this window'} />
    </section>

    <nav className="threads-subnav" aria-label="FYP Leak sections">{tabs.map(([k, label, icon]) => <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{icon}{label}</button>)}</nav>

    {inRange.length === 0 && tab !== 'ig' ? <section className="state-panel"><span className="state-icon"><Flame size={20} /></span><h3>No snapshots {runs.length ? 'in this period' : 'yet'}</h3><p>{runs.length ? 'Pick another date — days with data have an orange dot in the calendar.' : 'Run the “Metric Update The FYP Leak” skill to collect Google Trends, TikTok and X signals.'}</p></section>
      : signals === null && tab !== 'ig' ? <div className="state-panel"><Loader2 size={18} className="auth-spin" /><p>Loading snapshot…</p></div>
      : tab === 'radar' ? <RadarView run={latestRun} merged={merged} radar={radar} signals={sig} />
      : tab === 'ig' ? <IgView feed={igFeed} hm={hmScore?.latestCapture ?? null} kol={kolScore?.latestCapture ?? null} />
      : tab === 'gt' ? <GoogleView items={by('google_trends')} />
      : tab === 'tt' ? <TikTokView items={by('tiktok')} />
      : <XView items={by('x')} />}
  </section>;
}

function Heading({ title, action }: { title: React.ReactNode; action?: React.ReactNode }) {
  return <header className="section-heading"><h2>{title}</h2>{action}</header>;
}
const SRC_LABEL: Record<string, string> = { google_trends: 'Google', tiktok: 'TikTok', x: 'X', ig: 'HM/KOL' };
const Seen = ({ s }: { s: Signal }) => (s.seen ?? 1) > 1 ? <span className="kw-tag seen" title={`First seen ${s.first_seen ? wib(s.first_seen) : ''} WIB`}>seen {s.seen}×</span> : null;

// ---------- Radar ----------
const RADAR_COLORS = ['#ff743d', '#2395ff', '#ffbe41', '#00c37f', '#b96ce3', '#fd6a94'];
const short = (s: string, n = 26) => s.length > n ? `${s.slice(0, n - 1)}…` : s;

function radarOption(items: RadarItem[]): EChartsCoreOption {
  const indicator = [...AXES.map(a => a.label), 'HM/KOL'].map(name => ({ name, max: 100 }));
  return {
    animationDuration: 500,
    textStyle: { fontFamily: theme.sans },
    color: RADAR_COLORS,
    legend: { bottom: 0, type: 'scroll', icon: 'circle', itemWidth: 8, itemHeight: 8, textStyle: { color: theme.muted, fontSize: 11 }, pageTextStyle: { color: theme.muted } },
    tooltip: { trigger: 'item', backgroundColor: theme.card, borderColor: theme.borderStrong, textStyle: { color: theme.text, fontSize: 12 },
      formatter: (p: { name: string; value: number[] }) => `<b>${p.name}</b><br/>${indicator.map((ind, i) => `${ind.name}: <b>${p.value[i] || '–'}</b>`).join('<br/>')}` },
    radar: {
      indicator, radius: '62%', center: ['50%', '46%'], splitNumber: 4, shape: 'polygon',
      axisName: { color: theme.muted, fontSize: 11 },
      splitLine: { lineStyle: { color: theme.border } }, splitArea: { areaStyle: { color: ['rgba(255,255,255,.015)', 'rgba(255,255,255,.035)'] } },
      axisLine: { lineStyle: { color: theme.border } },
    },
    series: [{
      type: 'radar', symbol: 'circle', symbolSize: 4, lineStyle: { width: 1.5 }, areaStyle: { opacity: 0.12 }, emphasis: { areaStyle: { opacity: 0.3 }, lineStyle: { width: 2.5 } },
      data: items.map(x => ({ name: short(x.s.title), value: x.axes })),
    }],
  };
}

function RadarView({ run, merged, radar, signals }: { run: Run | null; merged: boolean; radar: RadarItem[]; signals: Signal[] }) {
  const top = radar.slice(0, 6);
  const radarOpt = useMemo(() => radarOption(top), [radar]); // eslint-disable-line react-hooks/exhaustive-deps
  const cats = useMemo(() => {
    const m = new Map<string, number>();
    signals.filter(s => s.is_organic !== false && s.category && !/^(Trending|Only on X)/i.test(s.category)).forEach(s => { const c = s.category!.split(' & ')[0]; m.set(c, (m.get(c) ?? 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [signals]);
  const catOpt = useMemo(() => hBarOption({ data: cats.map(([name, value], i) => ({ name, value, color: i === 0 ? theme.orange : '#ff9466' })), format: v => `${v}`, labelWidth: 150 }), [cats]);
  return <div className="an-stack">
    {run?.summary && <section className="panel"><Heading title={<><Flame size={15} className="text-[#ff743d]" />Leak brief</>} action={<span className="muted-action">{merged ? `From the newest snapshot (${wib(run.started_at)} WIB)` : 'Written when the snapshot was collected'}</span>} />
      <div className="agent-md"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: props => <a {...props} target="_blank" rel="noreferrer" /> }}>{run.summary}</ReactMarkdown></div></section>}
    {top.length > 0 && <div className="fyp-charts">
      <section className="panel">
        <Heading title="Signal radar · top topics" action={<span className="muted-action" title="Each spoke is a feed. 100 = rank #1 in that feed; HM/KOL grows with matching posts and breakouts.">How strong each topic is per platform</span>} />
        <EChart option={radarOpt} height={360} ariaLabel="Radar chart of the strongest cross-platform topics" />
      </section>
      <section className="panel">
        <Heading title="What people talk about" action={<span className="muted-action">Organic signals by category</span>} />
        <EChart option={catOpt} height={Math.max(160, cats.length * 34)} ariaLabel="Signals by category" />
      </section>
    </div>}
    <section className="panel">
      <Heading title="Topics showing up in more than one place" action={<span className="muted-action">More sources = stronger FYP signal</span>} />
      {radar.length === 0 ? <p className="fyp-empty">No overlap between sources in this snapshot yet.</p> : <ul className="fyp-list">
        {radar.map(({ s, hits, ig, sources }) => <li key={s.id} className="fyp-item">
          <div className="fyp-item-head">
            <span className={`fyp-score s${Math.min(sources, 4)}`}>{sources}</span>
            <strong>{s.title}</strong>
            <span className="kw-tag">{SRC_LABEL[s.source]} #{s.rank}</span><Seen s={s} />
            {[...hits.entries()].map(([src, list]) => <span key={src} className="kw-tag" title={list.map(o => o.title).join(' · ')}>{SRC_LABEL[src]}: {list[0].title}{list.length > 1 ? ` +${list.length - 1}` : ''}</span>)}
            {ig.length > 0 && <span className="kw-tag hm" title={ig.map(p => `@${p.account_handle}`).join(', ')}>HM/KOL: {ig.length} post{ig.length > 1 ? 's' : ''}{ig.some(p => p.breakout) ? ' · breakout' : ''}</span>}
          </div>
          {s.context && <p className="fyp-context">{s.context}</p>}
        </li>)}
      </ul>}
    </section>
  </div>;
}

// ---------- Homeless & KOL ----------
function IgView({ feed, hm, kol }: { feed: FeedPost[]; hm: string | null; kol: string | null }) {
  const [src, setSrc] = useState<'all' | 'HM' | 'KOL'>('all');
  const [only, setOnly] = useState(false);
  const rows = feed.filter(p => (src === 'all' || p.src === src) && (!only || p.breakout)).slice(0, 60);
  return <section className="panel">
    <Heading title={`${rows.length} recent posts, ranked by lift`} action={<span className="muted-action">HM captured {hm ? ago(hm) : '–'} · KOL captured {kol ? ago(kol) : '–'}</span>} />
    <div className="flex flex-wrap gap-1.5 pb-3">
      {(['all', 'HM', 'KOL'] as const).map(k => <button key={k} className={`filter-chip ${src === k ? 'active' : ''}`} onClick={() => setSrc(k)}>{k === 'all' ? 'All' : k === 'HM' ? 'Homeless media' : 'KOL'}</button>)}
      <button className={`filter-chip ${only ? 'active' : ''}`} onClick={() => setOnly(!only)}>Breakouts only</button>
    </div>
    <p className="fyp-note">Lift = likes ÷ the account's median likes. Likes/h = likes ÷ post age when it was captured (one snapshot per post, so young posts are under-counted).</p>
    <div className="table-scroll"><table>
      <thead><tr><th>Account</th><th>Post</th><th>Topic</th><th>Age at capture</th><th>Likes</th><th>Likes/h</th><th>Lift</th></tr></thead>
      <tbody>{rows.map(p => <tr key={`${p.src}${p.post_url}`}>
        <td><span className="inline-flex items-center gap-1.5">{p.src === 'KOL' ? <Star size={12} /> : <Users size={12} />}@{p.account_handle}</span></td>
        <td className="fyp-cap" title={p.caption ?? ''}>{p.post_url ? <a href={p.post_url} target="_blank" rel="noreferrer">{(p.caption ?? '(no caption)').slice(0, 80)}</a> : (p.caption ?? '').slice(0, 80)}<span className="kw-tag ml-1.5">{p.content_type}</span></td>
        <td>{p.viral_category ?? '–'}{p.primary_trigger ? <span className="text-zinc-500"> · {p.primary_trigger}</span> : null}</td>
        <td>{p.ageH < 1 ? `${Math.round(p.ageH * 60)} mnt` : `${p.ageH.toFixed(1)} h`}</td>
        <td>{fmt(p.likes)}</td><td>{compact(p.perHour)}</td>
        <td><span className={`status-pill ${p.breakout ? 'warn' : p.lift >= 1 ? 'on' : 'off'}`}>{p.lift.toFixed(1)}×</span></td>
      </tr>)}</tbody>
    </table></div>
  </section>;
}

// ---------- Google Trends ----------
function GoogleView({ items }: { items: Signal[] }) {
  const [feed, setFeed] = useState<'4h' | '24h'>('4h');
  const [open, setOpen] = useState<number | null>(null);
  const rows = items.filter(s => s.feed === feed);
  return <section className="panel">
    <Heading title={`Google Trends Indonesia · past ${feed === '4h' ? '4 hours' : '24 hours'}`} action={<div className="flex gap-1.5">{(['4h', '24h'] as const).map(f => <button key={f} className={`filter-chip ${feed === f ? 'active' : ''}`} onClick={() => setFeed(f)}>{f}</button>)}</div>} />
    <div className="table-scroll"><table>
      <thead><tr><th>#</th><th>Trend</th><th>Searches</th><th>Growth</th><th>Started</th><th>Status</th><th>Related searches</th></tr></thead>
      <tbody>{rows.flatMap(s => {
        const isOpen = open === s.id;
        return [<tr key={s.id} className="cursor-pointer" onClick={() => setOpen(isOpen ? null : s.id)}>
          <td>{s.rank}</td>
          <td><span className="inline-flex items-center gap-1">{isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}<strong className="font-medium">{s.title}</strong><Seen s={s} /></span></td>
          <td>{s.volume_text}</td><td>{s.growth_text}</td><td>{s.started_text}</td>
          <td><span className={`status-pill ${/active/i.test(s.status_text ?? '') ? 'on' : 'off'}`}>{s.status_text}</span></td>
          <td className="fyp-cap">{s.related_terms.slice(0, 4).join(', ')}{s.related_terms.length > 4 ? ` +${s.related_terms.length - 4}` : ''}</td>
        </tr>, isOpen && <tr key={`${s.id}-d`}><td colSpan={7} className="fyp-detail">
          {s.context && <p className="fyp-context">{s.context}</p>}
          <div className="flex flex-wrap gap-1 mb-2">{s.related_terms.map(t => <span key={t} className="kw-tag">{t}</span>)}</div>
          <ul className="fyp-samples">{s.samples.map((n, i) => <li key={i}><a href={n.url} target="_blank" rel="noreferrer">{n.title}<ExternalLink size={11} /></a><span>{n.meta}</span></li>)}</ul>
        </td></tr>];
      })}</tbody>
    </table></div>
  </section>;
}

// ---------- TikTok ----------
function TikTokView({ items }: { items: Signal[] }) {
  return <section className="panel">
    <Heading title="TikTok trending topics · Indonesia" action={<span className="muted-action">3 related videos opened per topic</span>} />
    <ul className="fyp-list">{items.map(s => <li key={s.id} className="fyp-item">
      <div className="fyp-item-head"><span className="fyp-rank">{s.rank}</span><strong>{s.title}</strong><span className="kw-tag">{s.volume_text} views</span><Seen s={s} />{s.category && <span className="kw-tag hm">{s.category}</span>}</div>
      {s.context && <p className="fyp-context">{s.context}</p>}
      <div className="fyp-videos">{s.samples.map((v, i) => <article key={i} className="fyp-video">
        <header><a href={v.author ? `https://www.tiktok.com/@${v.author}` : undefined} target="_blank" rel="noreferrer">@{v.author ?? '–'}</a><span>{v.ago}</span></header>
        <p title={v.caption}>{(v.caption ?? '').slice(0, 160)}{(v.caption ?? '').length > 160 ? '…' : ''}</p>
        <footer><span>▶ {v.views ?? '–'}</span><span>♥ {v.likes ?? '–'}</span><span>💬 {v.comments ?? '–'}</span><span>🔖 {v.saves ?? '–'}</span></footer>
        {v.sound && <small>♫ {v.sound}</small>}
      </article>)}</div>
    </li>)}</ul>
  </section>;
}

// ---------- X ----------
function XView({ items }: { items: Signal[] }) {
  const [feed, setFeed] = useState<'trending' | 'for_you'>('trending');
  const [showPromo, setShowPromo] = useState(false);
  const rows = items.filter(s => s.feed === feed && (showPromo || s.is_organic !== false));
  const hidden = items.filter(s => s.feed === feed && s.is_organic === false).length;
  return <section className="panel">
    <Heading title={feed === 'trending' ? 'X · Trending in Indonesia' : 'X · Explore “For you”'} action={<div className="flex gap-1.5">
      <button className={`filter-chip ${feed === 'trending' ? 'active' : ''}`} onClick={() => setFeed('trending')}>Trending</button>
      <button className={`filter-chip ${feed === 'for_you' ? 'active' : ''}`} onClick={() => setFeed('for_you')}>For you</button>
      <button className={`filter-chip ${showPromo ? 'active' : ''}`} onClick={() => setShowPromo(!showPromo)}>{showPromo ? 'Hide' : 'Show'} promo ({hidden})</button>
    </div>} />
    <ul className="fyp-list">{rows.map(s => <li key={s.id} className={`fyp-item ${s.is_organic === false ? 'promo' : ''}`}>
      <div className="fyp-item-head"><span className="fyp-rank">{s.rank}</span><strong>{s.title}</strong><Seen s={s} />
        {s.category && <span className="kw-tag hm">{s.category}</span>}{s.volume_text && <span className="kw-tag">{s.volume_text}</span>}
        <span className={`status-pill ${s.is_organic === false ? 'bad' : 'on'}`} title={s.organic_reason ?? ''}>{s.is_organic === false ? 'Promo / brand' : 'Organic'}</span>
      </div>
      {s.context && <p className="fyp-context">{s.context}</p>}
      {s.samples.length > 0 && <ul className="fyp-samples">{s.samples.map((t, i) => <li key={i}><a href={t.url} target="_blank" rel="noreferrer">{t.user}: {(t.text ?? '').slice(0, 140)}<ExternalLink size={11} /></a><span>{t.metrics}</span></li>)}</ul>}
    </li>)}</ul>
  </section>;
}
