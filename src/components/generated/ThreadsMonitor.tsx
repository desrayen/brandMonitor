import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, CornerDownRight, Crown, Download, ExternalLink, Heart, Loader2, MessageCircle, Network, Pencil, Play, Plus, Repeat2, Search, Settings2, Smile, Table2, Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { DateRangePicker, type DateRange } from './DateRangePicker';

import { type Topic, type Row, type Account, ago, fmt, fmtTime, wibDay, loadTopicRows, loadAccounts, polarity, polarityLabel } from './threadsShared';
import { SentimentView, ClusterView, InfluenceView, AnalyticsFilters, useScope } from './ThreadsAnalytics';

type Run = { id: string; topic_id: string | null; action: string; targets: string[]; trigger: string; status: string; items_count: number | null; error: string | null; started_at: string; finished_at: string | null };
const FN = `${(import.meta.env.NEXT_PUBLIC_SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')}/functions/v1/threads-monitor`;

async function callFn(op: string, body: Record<string, unknown> = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${FN}?op=${op}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

export function useIsSuperAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const uid = data.session?.user.id;
      if (!uid) return;
      const { data: r } = await supabase.from('user_roles').select('role').eq('user_id', uid).maybeSingle();
      setIsAdmin(r?.role === 'super_admin');
    });
  }, []);
  return isAdmin;
}

function Heading({ title, action }: { title: string; action?: React.ReactNode }) {
  return <header className="section-heading"><h2>{title}</h2>{action}</header>;
}

// ---------- main ----------
type Tab = 'data' | 'sentiment' | 'cluster' | 'influence' | 'settings';
export function ThreadsMonitor() {
  const isAdmin = useIsSuperAdmin();
  const [tab, setTab] = useState<Tab>('data');
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [topicId, setTopicId] = useState<string>('');
  const [range, setRange] = useState<DateRange>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Map<string, Account>>(new Map());
  const loadTopics = useCallback(async () => {
    const { data } = await supabase.from('threads_topics').select('*').order('created_at');
    setTopics((data ?? []) as Topic[]);
  }, []);
  useEffect(() => { loadTopics(); }, [loadTopics]);
  useEffect(() => { loadAccounts().then(setAccounts).catch(() => setAccounts(new Map())); }, []);
  useEffect(() => { if (topics && !topics.some(t => t.id === topicId)) setTopicId(topics[0]?.id ?? ''); }, [topics, topicId]);
  useEffect(() => {
    if (!topicId) return;
    let cancelled = false;
    setRows(null); setError(null);
    loadTopicRows(topicId).then(r => { if (!cancelled) setRows(r); }).catch(e => { if (!cancelled) setError(e?.message ?? String(e)); });
    return () => { cancelled = true; };
  }, [topicId]);

  const tabs: [Tab, string, React.ReactNode][] = [
    ['data', 'Data', <Table2 size={14} />], ['sentiment', 'Sentiment', <Smile size={14} />], ['cluster', 'Cluster Node', <Network size={14} />], ['influence', 'Top Influence', <Crown size={14} />],
    ...(isAdmin ? [['settings', 'Topics & collection', <Settings2 size={14} />] as [Tab, string, React.ReactNode]] : []),
  ];
  const shared = { topics, topicId, setTopicId, range, setRange, rows, error };
  return <section className="threads-monitor">
    <nav className="threads-subnav" aria-label="Threads monitor sections">
      {tabs.map(([k, label, icon]) => <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{icon}{label}</button>)}
    </nav>
    {topics === null ? <div className="state-panel"><Loader2 size={18} className="auth-spin" /><p>Getting your topics…</p></div>
      : tab === 'settings' && isAdmin ? <TopicSettings topics={topics} reload={loadTopics} />
      : !topics.length ? <NoTopics isAdmin={isAdmin} goSettings={() => setTab('settings')} />
      : tab === 'data' ? <DataView {...shared} topics={topics} />
      : <Analytics tab={tab} {...shared} topics={topics} accounts={accounts} />}
  </section>;
}

function NoTopics({ isAdmin, goSettings }: { isAdmin: boolean; goSettings: () => void }) {
  return <section className="state-panel"><span className="state-icon"><MessageCircle size={20} /></span><h3>No topics yet</h3><p>Add the keywords you want to monitor on Threads and the collection will start automatically.</p>{isAdmin ? <button className="state-btn" onClick={goSettings}><Plus size={14} />Add a topic</button> : <p>Ask an admin to add a topic.</p>}</section>;
}

type SharedProps = { topics: Topic[]; topicId: string; setTopicId: (id: string) => void; range: DateRange; setRange: (r: DateRange) => void; rows: Row[] | null; error: string | null };

function Analytics({ tab, accounts, ...p }: SharedProps & { tab: Tab; accounts: Map<string, Account> }) {
  const [relevantOnly, setRelevantOnly] = useState(true);
  const [onlyId, setOnlyId] = useState(true);
  const all = useMemo(() => p.rows ?? [], [p.rows]);
  const scope = useScope(all, { range: p.range, relevantOnly, onlyId });
  return <>
    <AnalyticsFilters topics={p.topics} topicId={p.topicId} setTopicId={p.setTopicId} range={p.range} setRange={p.setRange} all={all} relevantOnly={relevantOnly} setRelevantOnly={setRelevantOnly} onlyId={onlyId} setOnlyId={setOnlyId} />
    {p.error ? <section className="state-panel" role="alert"><h3>We couldn't load this topic</h3><p>Please try again in a moment.</p></section>
      : p.rows === null ? <div className="state-panel"><Loader2 size={18} className="auth-spin" /><p>Getting the latest Threads conversations…</p></div>
      : tab === 'sentiment' ? <SentimentView scope={scope} accounts={accounts} />
      : tab === 'cluster' ? <ClusterView scope={scope} accounts={accounts} />
      : <InfluenceView scope={scope} accounts={accounts} />}
  </>;
}

// ---------- data tab ----------
function DataView({ topics, topicId, setTopicId, range, setRange, rows, error }: SharedProps) {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'threads' | 'all' | 'replies'>('threads');
  const [onlyId, setOnlyId] = useState(true);
  const [showExcluded, setShowExcluded] = useState(false);
  const [sent, setSent] = useState<'all' | 'pos' | 'neu' | 'neg'>('all');
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(50);
  useEffect(() => { setOpen(null); setLimit(50); }, [topicId]);

  const topic = topics.find(t => t.id === topicId);
  const all = useMemo(() => rows ?? [], [rows]);
  const byId = useMemo(() => new Map(all.map(r => [r.post_id, r])), [all]);
  const childrenOf = useMemo(() => {
    const m = new Map<string, Row[]>();
    all.filter(r => r.is_reply && r.parent_post_id).forEach(r => { const a = m.get(r.parent_post_id!) ?? []; a.push(r); m.set(r.parent_post_id!, a); });
    m.forEach(a => a.sort((x, y) => String(x.taken_at).localeCompare(String(y.taken_at))));
    return m;
  }, [all]);

  const threadSize = useMemo(() => { const m = new Map<string, number>(); all.forEach(r => { if (r.is_reply && r.root_post_id) m.set(r.root_post_id, (m.get(r.root_post_id) ?? 0) + 1); }); return m; }, [all]);
  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return all.filter(r =>
      (showExcluded || !r.excluded) &&
      (!onlyId || r.is_reply || r.lang !== 'other') &&
      (kind === 'all' || (kind === 'replies' ? r.is_reply : !r.is_reply || !r.root_post_id || !byId.has(r.root_post_id))) &&
      (!range || (r.taken_at && wibDay(r.taken_at) >= range.start && wibDay(r.taken_at) <= range.end)) &&
      (sent === 'all' || polarity(r.sentiment_score) === sent) &&
      (!ql || (r.text ?? '').toLowerCase().includes(ql) || (r.username ?? '').toLowerCase().includes(ql)))
      .sort((a, b) => String(b.taken_at).localeCompare(String(a.taken_at)));
  }, [all, q, kind, onlyId, showExcluded, range, byId, sent]);

  const scope = all.filter(r => (showExcluded || !r.excluded) && (!onlyId || r.is_reply || r.lang !== 'other') && (!range || (r.taken_at && wibDay(r.taken_at) >= range.start && wibDay(r.taken_at) <= range.end)));
  const kpis = {
    threads: scope.filter(r => !r.is_reply).length,
    replies: scope.filter(r => r.is_reply).length,
    accounts: new Set(scope.map(r => r.username)).size,
    likes: scope.reduce((s, r) => s + (r.like_count ?? 0), 0),
  };

  const exportCsv = () => {
    const cols: (keyof Row)[] = ['post_id', 'taken_at', 'username', 'is_reply', 'root_post_id', 'parent_post_id', 'reply_to_username', 'parent_inferred', 'text', 'sentiment_score', 'issue', 'sentiment_reason', 'relevant', 'like_count', 'reply_count', 'repost_count', 'quote_count', 'reshare_count', 'view_count', 'lang', 'keywords', 'excluded', 'post_url', 'first_seen_at', 'last_seen_at'];
    const esc = (v: unknown) => { const s = Array.isArray(v) ? v.join('; ') : v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = [cols.join(','), ...filtered.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `threads-${(topic?.name ?? 'topic').replace(/\W+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  };

  const pill = (on: boolean) => `filter-chip ${on ? 'active' : ''}`;
  return <>
    <div className="threads-filters">
      <label className="threads-select"><span>Topic</span>
        <select value={topicId} onChange={e => setTopicId(e.target.value)}>{topics.map(t => <option key={t.id} value={t.id}>{t.name}{t.active ? '' : ' (paused)'}</option>)}</select>
      </label>
      <DateRangePicker value={range} onChange={setRange} dataDays={[...new Set(all.filter(r => r.taken_at).map(r => wibDay(r.taken_at!)))]} />
      <div className="threads-search"><Search size={13} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search text or @account" /></div>
      <div className="flex flex-wrap gap-1.5">
        <button className={pill(kind === 'threads')} onClick={() => setKind('threads')}>Threads</button>
        <button className={pill(kind === 'replies')} onClick={() => setKind('replies')}>Replies</button>
        <button className={pill(kind === 'all')} onClick={() => setKind('all')}>All</button>
      </div>
      <select className="sent-select" value={sent} onChange={e => setSent(e.target.value as typeof sent)} aria-label="Sentiment"><option value="all">All sentiment</option><option value="pos">Positive</option><option value="neu">Neutral</option><option value="neg">Negative</option></select>
      <button className={pill(onlyId)} onClick={() => setOnlyId(!onlyId)} title="Hide top-level posts detected as non-Indonesian">🇮🇩 Indonesian only</button>
      <button className={pill(showExcluded)} onClick={() => setShowExcluded(!showExcluded)} title="Show posts matching exclude keywords">Show excluded</button>
      <button className="filter-chip ml-auto inline-flex items-center gap-1.5" onClick={exportCsv} disabled={!filtered.length}><Download size={13} />Export CSV</button>
    </div>
    {topic && <p className="threads-meta"><span className="live-dot" />Keywords: {topic.keywords.map(k => <code key={k}>{k}</code>)} · Last collected {ago(topic.last_run_at)}{!topic.active && ' · paused'}</p>}

    {error ? <section className="state-panel" role="alert"><h3>We couldn't load this topic</h3><p>Please try again in a moment.</p></section>
      : rows === null ? <div className="state-panel"><Loader2 size={18} className="auth-spin" /><p>Getting the latest Threads conversations…</p></div>
      : <>
        <section className="kpi-grid threads-kpis">
          {([['Threads', kpis.threads, 'blue'], ['Replies', kpis.replies, 'orange'], ['Unique accounts', kpis.accounts, 'orange'], ['Total likes', kpis.likes, 'orange']] as const).map(([l, v, tone]) => <article key={l} className={`kpi-card ${tone}`}><div className="kpi-label"><p>{l}</p></div><strong>{fmt(v)}</strong></article>)}
        </section>
        <section className="panel">
          <Heading title={`${fmt(filtered.length)} ${kind === 'replies' ? 'replies' : kind === 'all' ? 'posts & replies' : 'threads'}`} action={<span className="muted-action">Newest first · click a thread to see who replied to whom</span>} />
          {filtered.length === 0 ? <p className="m-0 py-10 text-center text-[13px] text-zinc-500">Nothing matches these filters yet.</p> : <ul className="thread-list">
            {filtered.slice(0, limit).map(r => {
              const kids = childrenOf.get(r.post_id) ?? [];
              const isOpen = open === r.post_id;
              return <li key={r.post_id} className={`thread-item ${isOpen ? 'open' : ''}`}>
                <PostLine r={r} toggle={kids.length ? () => setOpen(isOpen ? null : r.post_id) : undefined} open={isOpen} replies={threadSize.get(r.post_id) ?? 0} parent={r.is_reply && r.parent_post_id ? byId.get(r.parent_post_id) : undefined} />
                {isOpen && <ReplyTree parentId={r.post_id} childrenOf={childrenOf} depth={1} />}
              </li>;
            })}
          </ul>}
          {filtered.length > limit && <div className="flex justify-center pt-4"><button className="filter-chip" onClick={() => setLimit(limit + 50)}>Show more ({fmt(filtered.length - limit)} left)</button></div>}
        </section>
      </>}
  </>;
}

function PostLine({ r, toggle, open, replies, parent }: { r: Row; toggle?: () => void; open?: boolean; replies?: number; parent?: Row }) {
  return <div className="post-line">
    <button className="post-toggle" onClick={toggle} disabled={!toggle} aria-label={open ? 'Hide replies' : 'Show replies'}>{toggle ? (open ? <ChevronDown size={15} /> : <ChevronRight size={15} />) : <span className="w-[15px]" />}</button>
    <div className="post-body">
      <div className="post-head">
        <strong>@{r.username ?? 'unknown'}</strong>
        {r.is_reply && r.reply_to_username && <span className="reply-to"><CornerDownRight size={11} />replying to @{r.reply_to_username}</span>}
        <span className="post-time">{fmtTime(r.taken_at)}</span>
        {r.keywords.map(k => <span key={k} className="kw-tag">{k}</span>)}
        {r.excluded && <span className="kw-tag excluded">excluded</span>}
        {r.lang === 'other' && !r.is_reply && <span className="kw-tag">non-ID</span>}
        {r.is_reply && !r.reply_to_username && <span className="kw-tag reply">reply · thread not collected</span>}
        <SentBadge r={r} />
      </div>
      {parent && <p className="parent-quote">↪ {parent.text?.slice(0, 120)}</p>}
      <p className="post-text">{r.text}</p>
      <div className="post-stats">
        <span><Heart size={12} />{fmt(r.like_count)}</span>
        <span><MessageCircle size={12} />{fmt(r.reply_count)}{replies ? <em> · {replies} stored</em> : null}</span>
        <span><Repeat2 size={12} />{fmt((r.repost_count ?? 0) + (r.quote_count ?? 0))}</span>
        {r.post_url && <a href={r.post_url.replace('threads.net', 'threads.com')} target="_blank" rel="noreferrer"><ExternalLink size={12} />Open</a>}
      </div>
    </div>
  </div>;
}

export function SentBadge({ r }: { r: Pick<Row, 'sentiment_score' | 'sentiment_reason' | 'issue' | 'relevant'> }) {
  const p = polarity(r.sentiment_score);
  if (!p) return <span className="sent-badge pending" title="Sentiment is scored automatically a few minutes after collection">scoring…</span>;
  const s = r.sentiment_score!;
  return <span className={`sent-badge ${p}`} title={[`${polarityLabel[p]} (${s > 0 ? '+' : ''}${s} on a −10…+10 scale)`, r.issue, r.sentiment_reason, r.relevant === false ? 'Marked off-topic' : null].filter(Boolean).join(' · ')}>{s > 0 ? '+' : ''}{s}{r.relevant === false && <em>off-topic</em>}</span>;
}

function ReplyTree({ parentId, childrenOf, depth }: { parentId: string; childrenOf: Map<string, Row[]>; depth: number }) {
  const kids = childrenOf.get(parentId) ?? [];
  if (!kids.length) return null;
  return <ul className="reply-tree" style={{ marginLeft: depth > 4 ? 0 : 18 }}>
    {kids.map(k => <li key={k.post_id}><PostLine r={k} /><ReplyTree parentId={k.post_id} childrenOf={childrenOf} depth={depth + 1} /></li>)}
  </ul>;
}

// ---------- settings tab (super admin) ----------
const emptyForm = { name: '', keywords: '', exclude_keywords: '', search_sort: 'recent' as const, fetch_replies: true, max_items: 300, interval_hours: 3, active: true };
const toList = (s: string) => [...new Set(s.split(/[\n,]/).map(x => x.trim()).filter(Boolean))];

function TopicSettings({ topics, reload }: { topics: Topic[]; reload: () => Promise<void> }) {
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [status, setStatus] = useState<{ apify_token: boolean; threads_cookies: boolean; anthropic?: boolean; unscored?: number; runs: Run[] } | null>(null);

  const loadStatus = useCallback(() => { callFn('status').then(setStatus).catch(() => setStatus(null)); }, []);
  useEffect(() => { loadStatus(); const t = setInterval(loadStatus, 20000); return () => clearInterval(t); }, [loadStatus]);

  const startEdit = (t?: Topic) => {
    setMsg(null);
    if (!t) { setForm(emptyForm); setEditing('new'); return; }
    setForm({ name: t.name, keywords: t.keywords.join('\n'), exclude_keywords: t.exclude_keywords.join('\n'), search_sort: t.search_sort as 'recent', fetch_replies: t.fetch_replies, max_items: t.max_items, interval_hours: t.interval_hours, active: t.active });
    setEditing(t.id);
  };
  const save = async () => {
    const keywords = toList(form.keywords);
    if (!form.name.trim() || !keywords.length) { setMsg({ ok: false, text: 'Give the topic a name and at least one keyword.' }); return; }
    setBusy('save');
    const payload = { name: form.name.trim(), keywords, exclude_keywords: toList(form.exclude_keywords), search_sort: form.search_sort, fetch_replies: form.fetch_replies, max_items: Number(form.max_items), interval_hours: Number(form.interval_hours), active: form.active, updated_at: new Date().toISOString() };
    const { error } = editing === 'new' ? await supabase.from('threads_topics').insert(payload) : await supabase.from('threads_topics').update(payload).eq('id', editing!);
    setBusy(null);
    if (error) { setMsg({ ok: false, text: 'Could not save. Please check the values and try again.' }); return; }
    setEditing(null); setMsg({ ok: true, text: 'Topic saved. It will be collected on the next hourly check, or press “Collect now”.' });
    await reload();
  };
  const toggle = async (t: Topic) => { await supabase.from('threads_topics').update({ active: !t.active, updated_at: new Date().toISOString() }).eq('id', t.id); await reload(); };
  const remove = async (t: Topic) => {
    if (!window.confirm(`Delete topic “${t.name}”? Collected posts stay in the database, but they will no longer be grouped under this topic.`)) return;
    await supabase.from('threads_topics').delete().eq('id', t.id); await reload();
  };
  const runNow = async (t: Topic) => {
    setBusy(t.id); setMsg(null);
    try { await callFn('collect', { topic_id: t.id }); setMsg({ ok: true, text: `Collection started for “${t.name}”. New posts usually appear within a few minutes.` }); await reload(); loadStatus(); }
    catch (e) { setMsg({ ok: false, text: `Couldn't start collection: ${(e as Error).message}` }); }
    setBusy(null);
  };

  const topicName = (id: string | null) => topics.find(t => t.id === id)?.name ?? '—';
  const recentFails = (status?.runs ?? []).filter(r => r.status === 'failed' || r.status === 'timed-out' || r.status === 'aborted');
  return <div className="threads-settings">
    <section className="panel">
      <Heading title="Collection health" action={<button className="filter-chip" onClick={loadStatus}>Refresh</button>} />
      <div className="health-row">
        <span className={status?.apify_token ? 'ok' : 'bad'}>{status?.apify_token ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}Apify connection</span>
        <span className={status?.threads_cookies ? 'ok' : 'warn'}>{status?.threads_cookies ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}Indonesian Threads session</span>
        <span className={status?.anthropic === false ? 'bad' : 'ok'}>{status?.anthropic === false ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}Sentiment scoring{status?.unscored ? ` · ${fmt(status.unscored)} waiting` : ' · up to date'}</span>
        <span className="muted">Runs automatically every hour; each topic is collected at its own interval. New posts are scored every few minutes.</span>
      </div>
      {recentFails.length > 0 && <p className="health-warn"><AlertTriangle size={13} />{recentFails.length} of the last {status!.runs.length} collection runs failed. If this keeps happening, the Threads session cookie has probably expired — export new cookies and update the <code>THREADS_COOKIE</code> secret.</p>}
    </section>

    <section className="panel">
      <Heading title="Topics" action={<button className="state-btn !mt-0" onClick={() => startEdit()}><Plus size={14} />New topic</button>} />
      {msg && <p className={`form-msg ${msg.ok ? 'ok' : 'bad'}`}>{msg.text}</p>}
      {editing && <TopicForm form={form} setForm={setForm} onCancel={() => setEditing(null)} onSave={save} saving={busy === 'save'} isNew={editing === 'new'} />}
      {topics.length === 0 && !editing && <p className="m-0 py-6 text-center text-[13px] text-zinc-500">No topics yet. Create one to start monitoring.</p>}
      <ul className="topic-list">
        {topics.map(t => <li key={t.id} className={t.active ? '' : 'paused'}>
          <div className="topic-main">
            <div className="topic-title"><strong>{t.name}</strong><span className={`status-pill ${t.active ? 'on' : 'off'}`}>{t.active ? 'Active' : 'Paused'}</span></div>
            <div className="topic-kws">{t.keywords.map(k => <code key={k}>{k}</code>)}{t.exclude_keywords.length > 0 && <span className="text-zinc-500">· excluding {t.exclude_keywords.map(k => <code key={k} className="ex">{k}</code>)}</span>}</div>
            <p className="topic-meta">Every {t.interval_hours} h · up to {t.max_items} posts per keyword · {t.search_sort} · {t.fetch_replies ? 'with replies' : 'posts only'} · last collected {ago(t.last_run_at)}</p>
          </div>
          <div className="topic-actions">
            <button className="filter-chip inline-flex items-center gap-1" onClick={() => runNow(t)} disabled={busy === t.id}>{busy === t.id ? <Loader2 size={13} className="auth-spin" /> : <Play size={13} />}Collect now</button>
            <button className="filter-chip" onClick={() => toggle(t)}>{t.active ? 'Pause' : 'Resume'}</button>
            <button className="icon-btn" onClick={() => startEdit(t)} aria-label="Edit"><Pencil size={14} /></button>
            <button className="icon-btn danger" onClick={() => remove(t)} aria-label="Delete"><Trash2 size={14} /></button>
          </div>
        </li>)}
      </ul>
    </section>

    <section className="panel">
      <Heading title="Recent collection runs" action={<span className="muted-action">Every item is archived in raw form before processing</span>} />
      <div className="table-scroll"><table>
        <thead><tr><th>Started</th><th>Topic</th><th>Type</th><th>Target</th><th>Status</th><th>Items</th></tr></thead>
        <tbody>{(status?.runs ?? []).map(r => <tr key={r.id}>
          <td>{fmtTime(r.started_at)}</td><td>{topicName(r.topic_id)}</td><td>{r.action === 'search' ? 'Keyword search' : r.action === 'profile' ? 'Follower counts' : 'Replies'}</td>
          <td className="max-w-[260px] truncate" title={r.targets.join(', ')}>{r.action === 'search' ? r.targets.join(', ') : r.action === 'profile' ? `${r.targets.length} accounts` : r.targets[0]?.replace(/^https?:\/\/www\.threads\.(net|com)\//, '')}</td>
          <td><span className={`status-pill ${r.status === 'succeeded' ? 'on' : r.status === 'running' || r.status === 'starting' ? 'run' : 'bad'}`} title={r.error ?? ''}>{r.status}</span></td>
          <td>{r.items_count ?? '…'}</td>
        </tr>)}</tbody>
      </table></div>
    </section>
  </div>;
}

function TopicForm({ form, setForm, onCancel, onSave, saving, isNew }: { form: typeof emptyForm; setForm: (f: typeof emptyForm) => void; onCancel: () => void; onSave: () => void; saving: boolean; isNew: boolean }) {
  const set = (k: keyof typeof emptyForm, v: unknown) => setForm({ ...form, [k]: v } as typeof emptyForm);
  return <div className="topic-form">
    <div className="flex items-center justify-between"><h3>{isNew ? 'New topic' : 'Edit topic'}</h3><button className="icon-btn" onClick={onCancel} aria-label="Close"><X size={14} /></button></div>
    <label>Topic name<input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Kenaikan harga BBM" /></label>
    <div className="grid gap-3 sm:grid-cols-2">
      <label>Keywords to monitor<textarea rows={4} value={form.keywords} onChange={e => set('keywords', e.target.value)} placeholder={'one per line, e.g.\nharga bbm\npertalite naik\n#bbmnaik'} /><small>Plain words, phrases or #hashtags. Use Indonesian wording to focus on Indonesian conversations.</small></label>
      <label>Exclude posts containing<textarea rows={4} value={form.exclude_keywords} onChange={e => set('exclude_keywords', e.target.value)} placeholder={'optional, one per line\ne.g. promo\nsewa mobil'} /><small>Matching posts are still saved, just hidden by default.</small></label>
    </div>
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
      <label>Collect every<select value={form.interval_hours} onChange={e => set('interval_hours', Number(e.target.value))}>{[1, 2, 3, 6, 12, 24, 48, 168].map(h => <option key={h} value={h}>{h < 48 ? `${h} hour${h > 1 ? 's' : ''}` : `${h / 24} days`}</option>)}</select></label>
      <label>Max posts per keyword<input type="number" min={10} max={5000} value={form.max_items} onChange={e => set('max_items', e.target.value)} /></label>
      <label>Order<select value={form.search_sort} onChange={e => set('search_sort', e.target.value)}><option value="recent">Most recent</option><option value="top">Top</option></select></label>
      <label className="check"><input type="checkbox" checked={form.fetch_replies} onChange={e => set('fetch_replies', e.target.checked)} />Collect replies</label>
    </div>
    <label className="check"><input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)} />Active (collect automatically)</label>
    <div className="flex justify-end gap-2"><button className="filter-chip" onClick={onCancel}>Cancel</button><button className="state-btn !mt-0" onClick={onSave} disabled={saving}>{saving ? <Loader2 size={14} className="auth-spin" /> : null}Save topic</button></div>
  </div>;
}
