import { useCallback, useMemo, useRef, useState } from 'react';
import type { ECharts } from 'echarts/core';
import { BadgeCheck, ExternalLink, Info, Search, X } from 'lucide-react';
import { EChart } from '@/components/charts/EChart';
import { DateRangePicker, type DateRange } from './DateRangePicker';
import { type Account, type Row, type Topic, SENT, compact, engagement, fmt, fmtTime, polarity, polarityLabel, scoreColor, signed, terms, wibDay, type Polarity } from './threadsShared';

// ---------- scope (filters shared by the analytics tabs) ----------
type Scope = { rows: Row[]; prev: Row[] | null; unscored: number; days: number | null };
const DAY = 864e5;
const shiftDay = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);

export function useScope(all: Row[], o: { range: DateRange; relevantOnly: boolean; onlyId: boolean }): Scope {
  return useMemo(() => {
    const base = all.filter(r => !r.excluded && (!o.onlyId || r.is_reply || r.lang !== 'other') && (!o.relevantOnly || r.relevant !== false));
    const inRange = (r: Row, a: string, b: string) => !!r.taken_at && wibDay(r.taken_at) >= a && wibDay(r.taken_at) <= b;
    if (!o.range) return { rows: base, prev: null, unscored: base.filter(r => r.sentiment_score == null).length, days: null };
    const { start, end } = o.range;
    const days = Math.round((Date.parse(end) - Date.parse(start)) / DAY) + 1;
    const rows = base.filter(r => inRange(r, start, end));
    const prev = base.filter(r => inRange(r, shiftDay(start, -days), shiftDay(start, -1)));
    return { rows, prev, unscored: rows.filter(r => r.sentiment_score == null).length, days };
  }, [all, o.range, o.relevantOnly, o.onlyId]);
}

export function AnalyticsFilters({ topics, topicId, setTopicId, range, setRange, all, relevantOnly, setRelevantOnly, onlyId, setOnlyId }: {
  topics: Topic[]; topicId: string; setTopicId: (id: string) => void; range: DateRange; setRange: (r: DateRange) => void; all: Row[];
  relevantOnly: boolean; setRelevantOnly: (v: boolean) => void; onlyId: boolean; setOnlyId: (v: boolean) => void;
}) {
  const pill = (on: boolean) => `filter-chip ${on ? 'active' : ''}`;
  const unscored = all.filter(r => r.sentiment_score == null).length;
  return <>
    <div className="threads-filters">
      <label className="threads-select"><span>Topic</span>
        <select value={topicId} onChange={e => setTopicId(e.target.value)}>{topics.map(t => <option key={t.id} value={t.id}>{t.name}{t.active ? '' : ' (paused)'}</option>)}</select>
      </label>
      <DateRangePicker value={range} onChange={setRange} dataDays={[...new Set(all.filter(r => r.taken_at).map(r => wibDay(r.taken_at!)))]} />
      <button className={pill(relevantOnly)} onClick={() => setRelevantOnly(!relevantOnly)} title="Hide posts the scorer marked as unrelated to the topic">On-topic only</button>
      <button className={pill(onlyId)} onClick={() => setOnlyId(!onlyId)} title="Hide top-level posts detected as non-Indonesian">🇮🇩 Indonesian only</button>
    </div>
    {unscored > 0 && <p className="threads-meta"><span className="live-dot" />{fmt(unscored)} of {fmt(all.length)} posts are still being scored — numbers update as scoring finishes.</p>}
  </>;
}

// ---------- shared bits ----------
function Panel({ title, sub, className = '', children, action }: { title: string; sub?: string; className?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return <section className={`panel ${className}`}>
    <header className="section-heading"><div><h2>{title}</h2>{sub && <p className="panel-sub">{sub}</p>}</div>{action}</header>
    {children}
  </section>;
}
function Empty({ text = 'Nothing to show for these filters yet.' }: { text?: string }) {
  return <p className="m-0 py-10 text-center text-[13px] text-zinc-500">{text}</p>;
}
function Avatar({ a, name }: { a?: Account; name: string }) {
  const [broken, setBroken] = useState(false);
  return a?.profile_pic_url && !broken
    ? <img className="avatar" src={a.profile_pic_url} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setBroken(true)} />
    : <span className="avatar">{(a?.full_name || name).replace(/^@/, '').slice(0, 1).toUpperCase()}</span>;
}
const profileUrl = (u: string) => `https://www.threads.com/@${u}`;

type Mix = { pos: number; neu: number; neg: number; scored: number; sum: number };
const mixOf = (rows: Row[]): Mix => {
  const m: Mix = { pos: 0, neu: 0, neg: 0, scored: 0, sum: 0 };
  rows.forEach(r => { const p = polarity(r.sentiment_score); if (!p) return; m[p]++; m.scored++; m.sum += r.sentiment_score!; });
  return m;
};
const pct = (n: number, d: number) => (d ? (n / d) * 100 : 0);
function MixBar({ m, labels = true }: { m: Mix; labels?: boolean }) {
  if (!m.scored) return <div className="mix-bar empty" />;
  return <div className="mix-bar">
    {(['pos', 'neu', 'neg'] as Polarity[]).map(k => m[k] ? <span key={k} style={{ width: `${pct(m[k], m.scored)}%`, background: SENT[k] }} title={`${polarityLabel[k]} ${pct(m[k], m.scored).toFixed(0)}% (${m[k]})`}>{labels && pct(m[k], m.scored) >= 12 ? `${pct(m[k], m.scored).toFixed(0)}%` : ''}</span> : null)}
  </div>;
}
function Delta({ now, prev, unit = '%', invert = false, pp = false }: { now: number; prev: number | null; unit?: string; invert?: boolean; pp?: boolean }) {
  if (prev == null) return null;
  const d = pp ? now - prev : prev ? ((now - prev) / prev) * 100 : 0;
  const good = invert ? d < 0 : d > 0;
  return <span className={`kpi-delta ${d === 0 ? '' : good ? 'up' : 'down'}`}>{signed(d, pp ? 0 : 1)}{pp ? 'pp' : unit}</span>;
}

// =====================================================================
// Sentiment
// =====================================================================
export function SentimentView({ scope, accounts }: { scope: Scope; accounts: Map<string, Account> }) {
  const { rows, prev } = scope;
  const m = useMemo(() => mixOf(rows), [rows]);
  const pm = useMemo(() => (prev ? mixOf(prev) : null), [prev]);
  const posPct = pct(m.pos, m.scored), negPct = pct(m.neg, m.scored), neuPct = pct(m.neu, m.scored);
  const net = Math.round(posPct - negPct);
  const pPos = pm ? pct(pm.pos, pm.scored) : null, pNeg = pm ? pct(pm.neg, pm.scored) : null;

  const influencers = useMemo(() => {
    const by = new Map<string, Row[]>();
    rows.forEach(r => { if (!r.username) return; const a = by.get(r.username) ?? []; a.push(r); by.set(r.username, a); });
    return [...by.entries()].map(([u, rs]) => ({ u, n: rs.length, m: mixOf(rs) })).sort((a, b) => b.n - a.n).slice(0, 10);
  }, [rows]);

  const topTerms = useMemo(() => {
    const count = (rs: Row[]) => { const c = new Map<string, number>(); rs.forEach(r => [...terms(r.text, 1), ...terms(r.text, 2)].forEach(t => c.set(t, (c.get(t) ?? 0) + 1))); return c; };
    const pos = count(rows.filter(r => (r.sentiment_score ?? 0) > 0)), neg = count(rows.filter(r => (r.sentiment_score ?? 0) < 0));
    const rank = (a: Map<string, number>, b: Map<string, number>) => [...a.entries()].filter(([, n]) => n >= 2)
      .map(([t, n]) => ({ t, n, w: n * Math.log2(2 + n / ((b.get(t) ?? 0) + 1)) * (t.includes(' ') ? 1.4 : 1) }))
      .sort((x, y) => y.w - x.w).slice(0, 14);
    return { pos: rank(pos, neg), neg: rank(neg, pos) };
  }, [rows]);

  const narratives = useMemo(() => {
    const group = (sign: 1 | -1) => {
      const g = new Map<string, { label: string; n: number; eng: number; sample: Row }>();
      rows.filter(r => r.issue && Math.sign(r.sentiment_score ?? 0) === sign).forEach(r => {
        const k = r.issue!.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
        const cur = g.get(k);
        if (!cur) g.set(k, { label: r.issue!, n: 1, eng: engagement(r), sample: r });
        else { cur.n++; cur.eng += engagement(r); if (engagement(r) > engagement(cur.sample)) cur.sample = r; }
      });
      return [...g.values()].sort((a, b) => b.n - a.n || b.eng - a.eng).slice(0, 6);
    };
    return { pos: group(1), neg: group(-1) };
  }, [rows]);

  const daily = useMemo(() => {
    const d = new Map<string, Mix>();
    rows.forEach(r => { if (!r.taken_at || r.sentiment_score == null) return; const k = wibDay(r.taken_at); const x = d.get(k) ?? { pos: 0, neu: 0, neg: 0, scored: 0, sum: 0 }; const p = polarity(r.sentiment_score)!; x[p]++; x.scored++; x.sum += r.sentiment_score; d.set(k, x); });
    return [...d.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  const dist = useMemo(() => { const c = Array(21).fill(0); rows.forEach(r => { if (r.sentiment_score != null) c[r.sentiment_score + 10]++; }); return c as number[]; }, [rows]);

  const donut = useMemo(() => ({
    tooltip: { trigger: 'item', backgroundColor: '#18181b', borderColor: '#3f3f46', textStyle: { color: '#fafafa', fontSize: 12 } },
    series: [{ type: 'pie', radius: ['62%', '84%'], avoidLabelOverlap: true, label: { show: false }, itemStyle: { borderColor: '#18181b', borderWidth: 2 },
      data: (['pos', 'neu', 'neg'] as Polarity[]).map(k => ({ name: polarityLabel[k], value: m[k], itemStyle: { color: SENT[k] } })) }],
  }), [m]);

  const trend = useMemo(() => ({
    tooltip: { trigger: 'axis', backgroundColor: '#18181b', borderColor: '#3f3f46', textStyle: { color: '#fafafa', fontSize: 12 } },
    legend: { top: 0, right: 0, textStyle: { color: '#a1a1aa', fontSize: 11 }, itemWidth: 10, itemHeight: 10 },
    grid: { left: 36, right: 40, top: 30, bottom: 24 },
    xAxis: { type: 'category', data: daily.map(([d]) => d.slice(5)), axisLabel: { color: '#71717a', fontSize: 10 }, axisLine: { lineStyle: { color: '#3f3f46' } } },
    yAxis: [{ type: 'value', axisLabel: { color: '#71717a', fontSize: 10 }, splitLine: { lineStyle: { color: '#27272a' } } },
      { type: 'value', min: -10, max: 10, axisLabel: { color: '#71717a', fontSize: 10 }, splitLine: { show: false } }],
    series: [
      ...(['pos', 'neu', 'neg'] as Polarity[]).map(k => ({ name: polarityLabel[k], type: 'bar', stack: 's', barMaxWidth: 26, itemStyle: { color: SENT[k] }, data: daily.map(([, x]) => x[k]) })),
      { name: 'Avg score', type: 'line', yAxisIndex: 1, smooth: true, symbolSize: 5, itemStyle: { color: '#fafafa' }, lineStyle: { width: 1.5 }, data: daily.map(([, x]) => +(x.sum / x.scored).toFixed(2)) },
    ],
  }), [daily]);

  const distOpt = useMemo(() => ({
    tooltip: { trigger: 'axis', backgroundColor: '#18181b', borderColor: '#3f3f46', textStyle: { color: '#fafafa', fontSize: 12 }, formatter: (p: { name: string; value: number }[]) => `Score ${p[0].name}: <b>${p[0].value}</b> posts` },
    grid: { left: 36, right: 8, top: 10, bottom: 24 },
    xAxis: { type: 'category', data: dist.map((_, i) => String(i - 10)), axisLabel: { color: '#71717a', fontSize: 10, interval: 1 }, axisLine: { lineStyle: { color: '#3f3f46' } } },
    yAxis: { type: 'value', axisLabel: { color: '#71717a', fontSize: 10 }, splitLine: { lineStyle: { color: '#27272a' } } },
    series: [{ type: 'bar', barCategoryGap: '20%', data: dist.map((v, i) => ({ value: v, itemStyle: { color: i < 10 ? SENT.neg : i > 10 ? SENT.pos : SENT.neu, borderRadius: [3, 3, 0, 0] } })) }],
  }), [dist]);

  if (!rows.length) return <section className="panel mt-4"><Empty /></section>;
  const avg = m.scored ? m.sum / m.scored : 0;
  return <div className="an-stack">
    <section className="kpi-grid threads-kpis">
      <article className="kpi-card blue"><div className="kpi-label"><p>Total mentions</p></div><strong>{fmt(rows.length)}</strong><p className="kpi-sub">{prev ? <>Prev {fmt(prev.length)} <Delta now={rows.length} prev={prev.length} /></> : 'Posts & replies in scope'}</p></article>
      <article className="kpi-card pos"><div className="kpi-label"><p>Positive sentiment</p></div><strong>{posPct.toFixed(0)}%</strong><p className="kpi-sub">{pPos != null ? <>Prev {pPos.toFixed(0)}% <Delta now={posPct} prev={pPos} pp /></> : `${fmt(m.pos)} posts`}</p></article>
      <article className="kpi-card neg"><div className="kpi-label"><p>Negative sentiment</p></div><strong>{negPct.toFixed(0)}%</strong><p className="kpi-sub">{pNeg != null ? <>Prev {pNeg.toFixed(0)}% <Delta now={negPct} prev={pNeg} pp invert /></> : `${fmt(m.neg)} posts`}</p></article>
      <article className="kpi-card orange"><div className="kpi-label"><p>Net sentiment score</p></div><strong>{signed(net)}</strong><p className="kpi-sub">{pPos != null && pNeg != null ? <>Prev {signed(Math.round(pPos - pNeg))} <Delta now={net} prev={Math.round(pPos - pNeg)} pp /></> : 'Positive % − negative %'}</p></article>
    </section>

    <div className="an-grid an-grid-3">
      <Panel title="Sentiment breakdown" sub={`Average score ${signed(avg, 1)} on a −10…+10 scale`}>
        <div className="donut-wrap">
          <EChart option={donut} height={190} ariaLabel="Sentiment breakdown" />
          <div className="donut-center"><strong>{compact(m.scored)}</strong><span>scored</span></div>
        </div>
        <div className="donut-legend">
          {(['pos', 'neu', 'neg'] as Polarity[]).map(k => <div key={k} style={{ borderTopColor: SENT[k] }}><b style={{ color: SENT[k] }}>{({ pos: posPct, neu: neuPct, neg: negPct })[k].toFixed(1)}%</b><strong>{fmt(m[k])}</strong><span>{polarityLabel[k]}</span></div>)}
        </div>
      </Panel>

      <Panel title="Most active accounts" sub="By number of posts & replies in scope">
        {influencers.length ? <ol className="active-list">
          {influencers.map((x, i) => <li key={x.u}>
            <span className="rank">#{i + 1}</span>
            <a className="who" href={profileUrl(x.u)} target="_blank" rel="noreferrer" title={`@${x.u}`}>{accounts.get(x.u)?.full_name || x.u}{accounts.get(x.u)?.is_verified && <BadgeCheck size={12} className="verified" />}</a>
            <MixBar m={x.m} />
            <span className="count">{x.n} posts</span>
          </li>)}
        </ol> : <Empty />}
        <div className="mix-legend">{(['pos', 'neu', 'neg'] as Polarity[]).map(k => <span key={k}><i style={{ background: SENT[k] }} />{polarityLabel[k]}</span>)}</div>
      </Panel>

      <Panel title="Top terms by sentiment" sub="Words & phrases most typical of each side">
        {(['pos', 'neg'] as const).map(k => <div key={k} className="term-block">
          <h3 style={{ color: SENT[k] }}>{k === 'pos' ? 'Positive' : 'Negative'}</h3>
          {topTerms[k].length ? <p className="term-cloud">{topTerms[k].map((t, i) => <span key={t.t} style={{ color: SENT[k], fontSize: `${Math.max(11, 15 - i * 0.35)}px`, fontWeight: i < 4 ? 600 : 400 }}>{t.t} <em>({t.n})</em></span>)}</p> : <p className="text-[12px] text-zinc-500">Not enough {k === 'pos' ? 'positive' : 'negative'} posts yet.</p>}
        </div>)}
      </Panel>
    </div>

    <div className="an-grid an-grid-2">
      <Panel title="Sentiment over time" sub="Daily posts by sentiment, with the average score (right axis)">
        {daily.length ? <EChart option={trend} height={240} ariaLabel="Sentiment over time" /> : <Empty />}
      </Panel>
      <Panel title="Score distribution" sub="How many posts got each score (−10 very negative … +10 very positive)">
        <EChart option={distOpt} height={240} ariaLabel="Score distribution" />
      </Panel>
    </div>

    <div className="an-grid an-grid-2">
      {(['pos', 'neg'] as const).map(k => <Panel key={k} title={`${k === 'pos' ? 'Positive' : 'Negative'} narratives (${(k === 'pos' ? posPct : negPct).toFixed(1)}%)`} sub="Main points people make, grouped from each post's summary" className={`narratives ${k}`}>
        {narratives[k].length ? <ul className="narrative-list">
          {narratives[k].map(n => <li key={n.label}>
            <div><strong>{n.label}</strong><span className="count">{n.n} post{n.n > 1 ? 's' : ''}</span></div>
            <p>“{(n.sample.text ?? '').slice(0, 160)}{(n.sample.text ?? '').length > 160 ? '…' : ''}” — @{n.sample.username}{n.sample.post_url && <a href={n.sample.post_url.replace('threads.net', 'threads.com')} target="_blank" rel="noreferrer" aria-label="Open post"><ExternalLink size={11} /></a>}</p>
          </li>)}
        </ul> : <Empty text={`No ${k === 'pos' ? 'positive' : 'negative'} posts in this scope.`} />}
      </Panel>)}
    </div>
  </div>;
}

// =====================================================================
// Cluster Node (who replies to whom)
// =====================================================================
type GNode = { id: string; posts: number; inW: number; outW: number; deg: number; w: number; sum: number; scored: number; cluster: number };
type GEdge = { s: string; t: string; n: number; sum: number; scored: number };
const PALETTE = ['#f97316', '#3b82f6', '#22c55e', '#e11d48', '#a855f7', '#eab308', '#14b8a6', '#ec4899', '#84cc16', '#06b6d4'];

function buildGraph(rows: Row[]) {
  const byId = new Map(rows.map(r => [r.post_id, r]));
  const nodes = new Map<string, GNode>();
  const node = (id: string) => { let n = nodes.get(id); if (!n) { n = { id, posts: 0, inW: 0, outW: 0, deg: 0, w: 0, sum: 0, scored: 0, cluster: -1 }; nodes.set(id, n); } return n; };
  const edges = new Map<string, GEdge>();
  rows.forEach(r => {
    if (!r.username) return;
    const me = node(r.username); me.posts++;
    if (r.sentiment_score != null) { me.sum += r.sentiment_score; me.scored++; }
    if (!r.is_reply) return;
    const target = (r.parent_post_id && byId.get(r.parent_post_id)?.username) || r.reply_to_username;
    if (!target || target === r.username) return;
    const k = `${r.username}\u0000${target}`;
    const e = edges.get(k) ?? { s: r.username, t: target, n: 0, sum: 0, scored: 0 };
    e.n++; if (r.sentiment_score != null) { e.sum += r.sentiment_score; e.scored++; }
    edges.set(k, e);
    me.outW++; node(target).inW++;
  });
  // undirected adjacency for degree + communities
  const adj = new Map<string, Map<string, number>>();
  edges.forEach(e => {
    for (const [a, b] of [[e.s, e.t], [e.t, e.s]]) { const m = adj.get(a) ?? new Map(); m.set(b, (m.get(b) ?? 0) + e.n); adj.set(a, m); }
  });
  nodes.forEach(n => { n.deg = adj.get(n.id)?.size ?? 0; n.w = n.inW + n.outW; });
  // label propagation (deterministic order: heaviest nodes first)
  const order = [...adj.keys()].sort((a, b) => (nodes.get(b)!.w - nodes.get(a)!.w) || a.localeCompare(b));
  const label = new Map(order.map(id => [id, id]));
  for (let it = 0; it < 15; it++) {
    let changed = 0;
    for (const id of order) {
      const score = new Map<string, number>();
      adj.get(id)!.forEach((w, nb) => { const l = label.get(nb)!; score.set(l, (score.get(l) ?? 0) + w); });
      let best = label.get(id)!, bestW = -1;
      score.forEach((w, l) => { if (w > bestW || (w === bestW && l < best)) { best = l; bestW = w; } });
      if (best !== label.get(id)) { label.set(id, best); changed++; }
    }
    if (!changed) break;
  }
  const groups = new Map<string, string[]>();
  label.forEach((l, id) => { const g = groups.get(l) ?? []; g.push(id); groups.set(l, g); });
  const clusters = [...groups.values()].sort((a, b) => b.length - a.length).map((members, i) => {
    members.forEach(id => (nodes.get(id)!.cluster = i));
    const ms = members.map(id => nodes.get(id)!).sort((a, b) => b.w - a.w);
    const sum = ms.reduce((s, n) => s + n.sum, 0), scored = ms.reduce((s, n) => s + n.scored, 0);
    return { i, size: members.length, top: ms.slice(0, 3).map(n => n.id), avg: scored ? sum / scored : null, color: PALETTE[i] ?? '#52525b' };
  });
  return { nodes, edges: [...edges.values()], clusters };
}

export function ClusterView({ scope, accounts }: { scope: Scope; accounts: Map<string, Account> }) {
  const { rows } = scope;
  const g = useMemo(() => buildGraph(rows), [rows]);
  const [cap, setCap] = useState(500);
  const [mode, setMode] = useState<'sentiment' | 'cluster'>('sentiment');
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState<string | null>(null);
  const chart = useRef<ECharts | null>(null);

  const connected = useMemo(() => [...g.nodes.values()].filter(n => n.deg > 0).sort((a, b) => b.w - a.w || b.posts - a.posts), [g]);
  const shown = useMemo(() => connected.slice(0, cap), [connected, cap]);
  const shownIdx = useMemo(() => new Map(shown.map((n, i) => [n.id, i])), [shown]);
  const shownEdges = useMemo(() => g.edges.filter(e => shownIdx.has(e.s) && shownIdx.has(e.t)), [g, shownIdx]);

  const m = useMemo(() => mixOf(rows), [rows]);
  const users = useMemo(() => new Set(rows.map(r => r.username).filter(Boolean)).size, [rows]);
  const N = connected.length, E = g.edges.length;

  const option = useMemo(() => {
    const maxW = Math.max(1, ...shown.map(n => n.w));
    return {
      backgroundColor: 'transparent',
      tooltip: { backgroundColor: '#18181b', borderColor: '#3f3f46', textStyle: { color: '#fafafa', fontSize: 12 },
        formatter: (p: { dataType: string; data: { name?: string; raw?: GNode; source?: string; target?: string; value?: number; avg?: number | null } }) => {
          if (p.dataType === 'edge') return `@${p.data.source} → @${p.data.target}<br/>${p.data.value} repl${p.data.value === 1 ? 'y' : 'ies'}${p.data.avg != null ? ` · avg ${signed(p.data.avg, 1)}` : ''}`;
          const n = p.data.raw!; const a = accounts.get(n.id);
          return `<b>@${n.id}</b>${a?.follower_count != null ? ` · ${compact(a.follower_count)} followers` : ''}<br/>${n.posts} posts · ${n.inW} replies received · ${n.outW} sent<br/>Avg sentiment ${n.scored ? signed(n.sum / n.scored, 1) : '—'} · cluster ${n.cluster + 1}`;
        } },
      series: [{
        type: 'graph', layout: 'force', roam: true, draggable: false, animation: false,
        force: { repulsion: shown.length > 300 ? 38 : 70, gravity: 0.12, edgeLength: [12, 60], friction: 0.15, layoutAnimation: true },
        emphasis: { focus: 'adjacency', lineStyle: { width: 2, opacity: 0.9 }, label: { show: true } },
        blur: { itemStyle: { opacity: 0.12 }, lineStyle: { opacity: 0.04 }, label: { show: false } },
        label: { show: false, position: 'right', color: '#e4e4e7', fontSize: 10, formatter: (p: { name: string }) => `@${p.name}` },
        lineStyle: { curveness: 0.15 },
        data: shown.map((n, i) => {
          const avg = n.scored ? n.sum / n.scored : null;
          const color = mode === 'cluster' ? (g.clusters[n.cluster]?.color ?? '#52525b') : scoreColor(avg);
          return { id: n.id, name: n.id, raw: n, symbolSize: Math.min(42, 4 + Math.sqrt(n.w / maxW) * 38), itemStyle: { color, borderColor: '#0b0b0d', borderWidth: 0.6 }, label: { show: i < 20 } };
        }),
        links: shownEdges.map(e => {
          const avg = e.scored ? e.sum / e.scored : null;
          return { source: e.s, target: e.t, value: e.n, avg, lineStyle: { color: mode === 'cluster' ? (g.clusters[g.nodes.get(e.s)!.cluster]?.color ?? '#52525b') : scoreColor(avg), opacity: 0.35, width: Math.min(4, 0.6 + Math.log2(e.n)) } };
        }),
      }],
    };
  }, [shown, shownEdges, mode, g, accounts]);

  const highlight = useCallback((ids: string[]) => {
    const c = chart.current; if (!c) return;
    c.dispatchAction({ type: 'downplay', seriesIndex: 0 });
    const idx = ids.map(id => shownIdx.get(id)).filter((x): x is number => x != null);
    if (idx.length) c.dispatchAction({ type: 'highlight', seriesIndex: 0, dataIndex: idx });
  }, [shownIdx]);
  const toggle = (id: string) => { const next = picked.includes(id) ? picked.filter(x => x !== id) : [...picked, id]; setPicked(next); highlight(next); };
  const onEvents = useMemo(() => ({ click: (p: { dataType?: string; name?: string }) => { if (p.dataType === 'node' && p.name) setFocus(p.name); } }), []);

  const topNodes = connected.slice(0, 50).filter(n => !q || n.id.toLowerCase().includes(q.toLowerCase()) || (accounts.get(n.id)?.full_name ?? '').toLowerCase().includes(q.toLowerCase()));
  const maxTop = Math.max(1, connected[0]?.w ?? 1);
  const fNode = focus ? g.nodes.get(focus) : null;

  if (!rows.length) return <section className="panel mt-4"><Empty /></section>;
  return <div className="cluster-layout">
    <section className="panel graph-panel">
      <header className="section-heading">
        <div><h2>Conversation network</h2><p className="panel-sub">Each dot is an account; a line means one replied to the other. Bigger dot = more replies sent and received.</p></div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="seg">{(['sentiment', 'cluster'] as const).map(k => <button key={k} className={mode === k ? 'active' : ''} onClick={() => setMode(k)}>{k === 'sentiment' ? 'Color by sentiment' : 'Color by cluster'}</button>)}</div>
          <label className="threads-select"><span>Show</span><select value={cap} onChange={e => setCap(Number(e.target.value))}>{[200, 500, 1000, 3000].map(c => <option key={c} value={c}>top {fmt(c)}</option>)}<option value={1e9}>all {fmt(N)}</option></select></label>
        </div>
      </header>
      {shown.length < 2 ? <Empty text="Not enough reply conversations in this scope to draw a network yet." />
        : <EChart option={option} height={typeof window !== 'undefined' && window.innerWidth < 720 ? 440 : 620} renderer="canvas" onReady={c => (chart.current = c)} onEvents={onEvents} ariaLabel="Network of who replies to whom" className="graph-canvas" />}
      <div className="mix-legend">
        {mode === 'sentiment' ? (['pos', 'neu', 'neg'] as Polarity[]).map(k => <span key={k}><i style={{ background: SENT[k] }} />{polarityLabel[k]}</span>)
          : g.clusters.slice(0, 8).map(c => <span key={c.i}><i style={{ background: c.color }} />Cluster {c.i + 1}: @{c.top[0]}</span>)}
        <span className="text-zinc-500">· Scroll to zoom, drag to pan, click a dot for details</span>
      </div>
      {fNode && <div className="node-card">
        <button className="icon-btn" onClick={() => setFocus(null)} aria-label="Close"><X size={13} /></button>
        <div className="flex items-center gap-2"><Avatar a={accounts.get(fNode.id)} name={fNode.id} /><div><strong>{accounts.get(fNode.id)?.full_name || fNode.id}</strong><a href={profileUrl(fNode.id)} target="_blank" rel="noreferrer">@{fNode.id} <ExternalLink size={10} /></a></div></div>
        <dl><div><dt>Posts</dt><dd>{fNode.posts}</dd></div><div><dt>Replies received</dt><dd>{fNode.inW}</dd></div><div><dt>Replies sent</dt><dd>{fNode.outW}</dd></div><div><dt>Connections</dt><dd>{fNode.deg}</dd></div><div><dt>Avg sentiment</dt><dd style={{ color: scoreColor(fNode.scored ? fNode.sum / fNode.scored : null) }}>{fNode.scored ? signed(fNode.sum / fNode.scored, 1) : '—'}</dd></div><div><dt>Followers</dt><dd>{accounts.get(fNode.id)?.follower_count != null ? compact(accounts.get(fNode.id)!.follower_count) : '…'}</dd></div></dl>
        <p className="text-[11.5px] text-zinc-500">Cluster {fNode.cluster + 1} · {g.clusters[fNode.cluster]?.size ?? 0} accounts</p>
      </div>}
    </section>

    <aside className="node-insight panel">
      <h2>Node insight</h2>
      <h3>Graph profile</h3>
      <div className="stat-grid">
        <div><span>All mentions</span><strong>{fmt(rows.length)}</strong></div>
        <div><span>All users</span><strong>{fmt(users)}</strong></div>
        <div><span>Nodes</span><strong>{fmt(N)}</strong></div>
        <div><span>Edges</span><strong>{fmt(E)}</strong></div>
        <div><span>Density</span><strong>{N > 1 ? `${((E / (N * (N - 1))) * 100).toFixed(2)}%` : '—'}</strong></div>
        <div><span>Avg degree</span><strong>{N ? ((2 * E) / N).toFixed(1) : '—'}</strong></div>
      </div>
      <h3>Sentiments</h3>
      {(['pos', 'neu', 'neg'] as Polarity[]).map(k => <div key={k} className="sent-row"><div><span>{polarityLabel[k]}</span><b style={{ color: SENT[k] }}>{pct(m[k], m.scored).toFixed(0)}%</b></div><i><em style={{ width: `${pct(m[k], m.scored)}%`, background: SENT[k] }} /></i></div>)}
      <h3>Clusters ({g.clusters.filter(c => c.size > 1).length})</h3>
      <ul className="cluster-list">
        {g.clusters.filter(c => c.size > 1).slice(0, 6).map(c => <li key={c.i}><button onClick={() => { const ids = [...g.nodes.values()].filter(n => n.cluster === c.i).map(n => n.id); setPicked(ids.slice(0, 200)); highlight(ids); }}>
          <i style={{ background: c.color }} /><span>Cluster {c.i + 1} · {c.size} accounts<em>@{c.top.join(', @')}</em></span><b style={{ color: scoreColor(c.avg) }}>{c.avg != null ? signed(c.avg, 1) : '—'}</b>
        </button></li>)}
      </ul>
      <h3>Top nodes (50) {picked.length > 0 && <button className="clear-link" onClick={() => { setPicked([]); highlight([]); }}>clear</button>}</h3>
      <div className="threads-search w-full"><Search size={13} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search node" /></div>
      <ul className="top-nodes">
        {topNodes.map(n => <li key={n.id}>
          <label><input type="checkbox" checked={picked.includes(n.id)} onChange={() => toggle(n.id)} /><span title={accounts.get(n.id)?.full_name ?? ''}>@{n.id}</span><b>{n.w}</b></label>
          <i><em style={{ width: `${(n.w / maxTop) * 100}%`, background: scoreColor(n.scored ? n.sum / n.scored : null) }} /></i>
        </li>)}
      </ul>
    </aside>
  </div>;
}

// =====================================================================
// Top Influence
// =====================================================================
export function InfluenceView({ scope, accounts }: { scope: Scope; accounts: Map<string, Account> }) {
  const { rows } = scope;
  const [sort, setSort] = useState<'influence' | 'followers' | 'mentions'>('influence');
  const [more, setMore] = useState(false);
  const list = useMemo(() => {
    const byId = new Map(rows.map(r => [r.post_id, r]));
    const by = new Map<string, { u: string; mentions: number; threads: number; repliesIn: number; eng: number; m: Mix }>();
    const get = (u: string) => { let x = by.get(u); if (!x) { x = { u, mentions: 0, threads: 0, repliesIn: 0, eng: 0, m: { pos: 0, neu: 0, neg: 0, scored: 0, sum: 0 } }; by.set(u, x); } return x; };
    rows.forEach(r => {
      if (!r.username) return;
      const x = get(r.username); x.mentions++; if (!r.is_reply) x.threads++; x.eng += engagement(r);
      const p = polarity(r.sentiment_score); if (p) { x.m[p]++; x.m.scored++; x.m.sum += r.sentiment_score!; }
      const target = r.is_reply ? ((r.parent_post_id && byId.get(r.parent_post_id)?.username) || r.reply_to_username) : null;
      if (target && target !== r.username) get(target).repliesIn++;
    });
    return [...by.values()].map(x => ({ ...x, followers: accounts.get(x.u)?.follower_count ?? null, influence: x.eng + 2 * x.repliesIn }));
  }, [rows, accounts]);
  const sorted = useMemo(() => [...list].sort((a, b) => sort === 'followers' ? (b.followers ?? -1) - (a.followers ?? -1) : sort === 'mentions' ? b.mentions - a.mentions || b.influence - a.influence : b.influence - a.influence), [list, sort]);
  const top = sorted.slice(0, more ? 25 : 10);
  const pending = list.filter(x => x.followers == null).length;

  const scatter = useMemo(() => {
    const pts = [...list].filter(x => x.followers != null).sort((a, b) => b.influence - a.influence).slice(0, 60);
    const maxI = Math.max(1, ...pts.map(p => p.influence));
    return {
      tooltip: { backgroundColor: '#18181b', borderColor: '#3f3f46', textStyle: { color: '#fafafa', fontSize: 12 }, formatter: (p: { data: { u: string; value: number[]; inf: number } }) => `<b>@${p.data.u}</b><br/>${fmt(p.data.value[1])} followers · ${p.data.value[0]} mentions<br/>Influence ${compact(p.data.inf)}` },
      grid: { left: 54, right: 96, top: 16, bottom: 44 },
      xAxis: { type: 'value', name: 'Interest (mentions)', nameLocation: 'middle', nameGap: 28, min: 0, max: (v: { max: number }) => Math.ceil(v.max * 1.08) + 1, nameTextStyle: { color: '#a1a1aa', fontSize: 11 }, minInterval: 1, axisLabel: { color: '#71717a', fontSize: 10 }, splitLine: { lineStyle: { color: '#27272a' } } },
      yAxis: { type: 'log', name: 'Power (followers, log)', nameLocation: 'middle', nameGap: 40, nameTextStyle: { color: '#a1a1aa', fontSize: 11 }, min: 1, axisLabel: { color: '#71717a', fontSize: 10, formatter: (v: number) => compact(v) }, splitLine: { lineStyle: { color: '#27272a' } } },
      series: [{ type: 'scatter', data: pts.map((p, i) => ({ u: p.u, inf: p.influence, value: [p.mentions, Math.max(1, p.followers!)], symbolSize: 8 + Math.sqrt(p.influence / maxI) * 34,
        itemStyle: { color: scoreColor(p.m.scored ? p.m.sum / p.m.scored : null), opacity: 0.8, borderColor: '#0b0b0d' },
        label: { show: i < 12, position: 'right', color: '#e4e4e7', fontSize: 10, formatter: () => accounts.get(p.u)?.full_name?.slice(0, 22) || `@${p.u}` } })) }],
    };
  }, [list, accounts]);

  if (!rows.length) return <section className="panel mt-4"><Empty /></section>;
  const maxV = Math.max(1, ...top.map(x => sort === 'followers' ? x.followers ?? 0 : sort === 'mentions' ? x.mentions : x.influence));
  return <div className="an-stack">
    <div className="influence-layout">
      <Panel title="Top influencers on Threads" sub="Power (followers) versus interest (how often they post about this topic). Bubble size = influence, colour = their average sentiment.">
        <EChart option={scatter} height={more ? 640 : 520} ariaLabel="Influencer map" />
        {pending > 0 && <p className="panel-note"><Info size={12} />Follower counts for {fmt(pending)} accounts are still being collected and will appear automatically.</p>}
      </Panel>
      <Panel title={`Ranking · top ${top.length}`} sub="Influence = likes + 2×replies + 3×reposts/quotes their posts got, plus 2× replies they received in this topic." action={<div className="seg">{(['influence', 'followers', 'mentions'] as const).map(k => <button key={k} className={sort === k ? 'active' : ''} onClick={() => setSort(k)}>{k[0].toUpperCase() + k.slice(1)}</button>)}</div>}>
        <ol className="influence-list">
          {top.map(x => {
            const a = accounts.get(x.u);
            const v = sort === 'followers' ? x.followers ?? 0 : sort === 'mentions' ? x.mentions : x.influence;
            return <li key={x.u}>
              <span className="fill" style={{ width: `${(v / maxV) * 100}%` }} />
              <Avatar a={a} name={x.u} />
              <div className="who">
                <div><a href={profileUrl(x.u)} target="_blank" rel="noreferrer"><strong>{a?.full_name || x.u}</strong></a>{a?.is_verified && <BadgeCheck size={13} className="verified" />}<span className="handle">@{x.u}</span></div>
                <span className="followers">{x.followers != null ? `${compact(x.followers)} followers` : 'followers pending'} · <span style={{ color: scoreColor(x.m.scored ? x.m.sum / x.m.scored : null) }}>avg {x.m.scored ? signed(x.m.sum / x.m.scored, 1) : '—'}</span></span>
              </div>
              <div className="val"><strong>{compact(sort === 'followers' ? x.followers ?? 0 : x.influence)}</strong><span>({x.mentions})</span></div>
            </li>;
          })}
        </ol>
        {sorted.length > 10 && <div className="flex justify-center pt-3"><button className="filter-chip" onClick={() => setMore(!more)}>{more ? 'Show top 10' : 'Show top 25'}</button></div>}
      </Panel>
    </div>
    <Panel title="Most engaging posts" sub="Top posts in scope by engagement">
      <ul className="top-posts">
        {[...rows].sort((a, b) => engagement(b) - engagement(a)).slice(0, 8).map(r => <li key={r.post_id}>
          <div className="head"><strong>@{r.username}</strong><span>{fmtTime(r.taken_at)}</span>{r.sentiment_score != null && <span className={`sent-badge ${polarity(r.sentiment_score)}`}>{r.sentiment_score > 0 ? '+' : ''}{r.sentiment_score}</span>}</div>
          <p>{(r.text ?? '').slice(0, 220)}{(r.text ?? '').length > 220 ? '…' : ''}</p>
          <div className="stats"><span>♥ {fmt(r.like_count)}</span><span>💬 {fmt(r.reply_count)}</span><span>↻ {fmt((r.repost_count ?? 0) + (r.quote_count ?? 0))}</span>{r.post_url && <a href={r.post_url.replace('threads.net', 'threads.com')} target="_blank" rel="noreferrer"><ExternalLink size={11} />Open</a>}</div>
        </li>)}
      </ul>
    </Panel>
  </div>;
}
