import { useEffect, useState } from 'react';
import { ExternalLink, Gauge, Lightbulb, ListChecks, Loader2, MessageSquareQuote, ScanSearch, Sparkles, TriangleAlert, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { StatCard, type Tint } from '../StatCard';
import { type Topic, SENT, fmt, fmtTime } from './threadsShared';

type Tone = 'pos' | 'neu' | 'neg';
type Stance = { label: string; count: number; tone?: Tone; note?: string };
type Theme = { title: string; description?: string; count?: number; tone?: Tone };
type Quote = { username?: string; text: string; post_url?: string | null; theme?: string; tone?: Tone };
type Insight = {
  id: string; topic_id: string; title: string | null; summary: string; confidence: 'low' | 'medium' | 'high';
  total_items: number | null; relevant_items: number | null; stance: Stance[]; themes: Theme[]; quotes: Quote[];
  learnings: string[]; recommendations: string[]; caveats: string | null; analyzed_by: string | null; analyzed_at: string;
};

const toneColor = (t?: Tone) => (t ? SENT[t] : '#71717a');
const toneLabel: Record<Tone, string> = { pos: 'Supportive', neu: 'Neutral', neg: 'Struggling / critical' };
const confTint: Record<Insight['confidence'], Tint> = { low: 'warning', medium: 'info', high: 'success' };
const confLabel: Record<Insight['confidence'], string> = { low: 'Low', medium: 'Medium', high: 'High' };

function Panel({ title, sub, icon, children, className = '' }: { title: string; sub?: string; icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>
    <header className="section-heading"><div><h2>{icon}{title}</h2>{sub && <p className="panel-sub">{sub}</p>}</div></header>
    {children}
  </section>;
}

export function InsightView({ topics, topicId, setTopicId }: { topics: Topic[]; topicId: string; setTopicId: (id: string) => void }) {
  const [insight, setInsight] = useState<Insight | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!topicId) return;
    let cancelled = false;
    setInsight(undefined); setError(null);
    supabase.from('threads_insights').select('*').eq('topic_id', topicId).order('analyzed_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data, error: e }) => { if (cancelled) return; if (e) setError(e.message); else setInsight((data as Insight | null) ?? null); });
    return () => { cancelled = true; };
  }, [topicId]);

  const filters = <div className="threads-filters">
    <label className="threads-select"><span>Topic</span>
      <select value={topicId} onChange={e => setTopicId(e.target.value)}>{topics.map(t => <option key={t.id} value={t.id}>{t.name}{t.active ? '' : ' (paused)'}</option>)}</select>
    </label>
  </div>;

  if (error) return <>{filters}<section className="state-panel" role="alert"><h3>We couldn't load this insight</h3><p>Please try again in a moment.</p></section></>;
  if (insight === undefined) return <>{filters}<div className="state-panel"><Loader2 size={18} className="auth-spin" /><p>Getting the latest insight…</p></div></>;
  if (insight === null) return <>{filters}<section className="state-panel"><span className="state-icon"><Sparkles size={20} /></span><h3>No insight for this topic yet</h3><p>Insights are written after reading the collected conversations. Ask for an analysis of this topic and it will appear here.</p></section></>;

  const stanceTotal = insight.stance.reduce((s, x) => s + (x.count || 0), 0);
  return <>
    {filters}
    <p className="threads-meta"><span className="live-dot" />Analysed {fmtTime(insight.analyzed_at)}{insight.analyzed_by ? ` · ${insight.analyzed_by}` : ''}</p>
    <div className="kpi-grid threads-kpis">
      <StatCard icon={<ScanSearch size={18} />} label="Items scanned" value={fmt(insight.total_items)} sub="Posts and replies in the topic" />
      <StatCard icon={<Users size={18} />} label="On-topic posts" value={fmt(insight.relevant_items)} sub={insight.total_items ? `${((insight.relevant_items ?? 0) / insight.total_items * 100).toFixed(1)}% of items scanned` : undefined} tint={(insight.relevant_items ?? 0) < 30 ? 'warning' : 'none'} />
      <StatCard icon={<Gauge size={18} />} label="Confidence" value={confLabel[insight.confidence]} tint={confTint[insight.confidence]} sub="How much the data supports these findings" />
      <StatCard icon={<MessageSquareQuote size={18} />} label="Themes" value={fmt(insight.themes.length)} sub={`${fmt(insight.quotes.length)} example posts`} />
    </div>

    <div className="insight-grid">
      <Panel title={insight.title || 'Summary'} icon={<Sparkles size={14} />} className="insight-wide">
        <p className="insight-summary">{insight.summary}</p>
        {insight.caveats && <p className="insight-caveat"><TriangleAlert size={13} />{insight.caveats}</p>}
      </Panel>

      {insight.stance.length > 0 && <Panel title="Audience stance" sub="How people talk about the topic" icon={<Users size={14} />}>
        <div className="insight-bar">
          {insight.stance.map((s, i) => s.count > 0 && <span key={i} style={{ width: `${(s.count / Math.max(stanceTotal, 1)) * 100}%`, background: toneColor(s.tone) }} title={`${s.label}: ${s.count}`} />)}
        </div>
        <ul className="insight-list">
          {insight.stance.map((s, i) => <li key={i}><span className="insight-dot" style={{ background: toneColor(s.tone) }} /><div><strong>{s.label}</strong> <em>{fmt(s.count)} posts{s.tone ? ` · ${toneLabel[s.tone]}` : ''}</em>{s.note && <p>{s.note}</p>}</div></li>)}
        </ul>
      </Panel>}

      {insight.themes.length > 0 && <Panel title="Main themes" sub="What people keep bringing up" icon={<ListChecks size={14} />}>
        <ul className="insight-list">
          {insight.themes.map((t, i) => <li key={i}><span className="insight-dot" style={{ background: toneColor(t.tone) }} /><div><strong>{t.title}</strong>{t.count != null && <em> {fmt(t.count)} posts</em>}{t.description && <p>{t.description}</p>}</div></li>)}
        </ul>
      </Panel>}

      {insight.learnings.length > 0 && <Panel title="Key learnings" icon={<Lightbulb size={14} />}>
        <ul className="insight-bullets">{insight.learnings.map((l, i) => <li key={i}>{l}</li>)}</ul>
      </Panel>}

      {insight.recommendations.length > 0 && <Panel title="What to do next" icon={<ListChecks size={14} />}>
        <ul className="insight-bullets">{insight.recommendations.map((l, i) => <li key={i}>{l}</li>)}</ul>
      </Panel>}

      {insight.quotes.length > 0 && <Panel title="Example posts" sub="Public Threads posts that illustrate the themes" icon={<MessageSquareQuote size={14} />} className="insight-wide">
        <div className="insight-quotes">
          {insight.quotes.map((q, i) => <blockquote key={i} style={{ borderLeftColor: toneColor(q.tone) }}>
            <p>{q.text}</p>
            <footer>{q.username && <span>@{q.username}</span>}{q.theme && <span className="insight-chip">{q.theme}</span>}{q.post_url && <a href={q.post_url} target="_blank" rel="noreferrer noopener" aria-label="Open on Threads"><ExternalLink size={12} /></a>}</footer>
          </blockquote>)}
        </div>
      </Panel>}
    </div>
  </>;
}
