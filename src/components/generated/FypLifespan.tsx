import { useEffect, useMemo, useState } from 'react';
import { Hourglass, ShieldCheck, ShieldAlert, ShieldX, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { StatCard } from '../StatCard';
import { EChart } from '../charts/EChart';
import { hBarOption } from '../charts/options';

// One row of the public.fyp_topic_lifespan view (topics are defined in public.fyp_topics).
type Topic = {
  topic_key: string; title: string; category: string | null;
  sentiment: 'positif' | 'netral' | 'negatif' | 'campuran' | null;
  brand_safety: 'aman' | 'hati-hati' | 'hindari' | null; safety_reason: string | null;
  est_started_on: string; started_basis: string | null;
  first_seen_wib: string; last_seen_wib: string; days_alive: number; still_trending: boolean;
  snapshots: number; sources: string[]; source_count: number;
  tiktok_peak_views: number | null; google_peak_searches: number | null; best_rank: number | null;
};
type TopicSignal = { topic_key: string; source: string; feed: string; title: string; rank: number | null; captured_at: string; context: string | null };

const SRC: Record<string, string> = { google_trends: 'Google', tiktok: 'TikTok', x: 'X' };
const SAFETY: Record<string, { label: string; pill: string; color: string }> = {
  aman: { label: 'Aman di-riding', pill: 'on', color: '#4bde81' },
  'hati-hati': { label: 'Hati-hati', pill: 'warn', color: '#ff9466' },
  hindari: { label: 'Hindari', pill: 'bad', color: '#f62c1e' },
};
const SENTIMENT: Record<string, string> = { positif: 'on', netral: 'off', campuran: 'run', negatif: 'bad' };
const day = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
const compact = (n: number | null) => n == null ? null : n >= 1e6 ? `${(n / 1e6).toFixed(0)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : String(n);

export function FypLifespan() {
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [signals, setSignals] = useState<TopicSignal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [safety, setSafety] = useState<'all' | 'aman' | 'hati-hati' | 'hindari'>('all');
  const [category, setCategory] = useState('all');
  const [activeOnly, setActiveOnly] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('fyp_topic_lifespan').select('*').order('days_alive', { ascending: false }).then(({ data, error }) => {
      if (error) { setError(error.message); return; }
      setTopics((data ?? []) as Topic[]);
    });
    supabase.from('fyp_signals').select('topic_key,source,feed,title,rank,captured_at,context').not('topic_key', 'is', null)
      .order('captured_at', { ascending: false }).limit(3000)
      .then(({ data }) => setSignals((data ?? []) as TopicSignal[]));
  }, []);

  const categories = useMemo(() => [...new Set((topics ?? []).map(t => t.category ?? 'Lainnya'))].sort(), [topics]);
  const rows = useMemo(() => (topics ?? [])
    .filter(t => (safety === 'all' || t.brand_safety === safety) && (category === 'all' || (t.category ?? 'Lainnya') === category) && (!activeOnly || t.still_trending))
    .sort((a, b) => b.days_alive - a.days_alive || b.source_count - a.source_count || b.snapshots - a.snapshots), [topics, safety, category, activeOnly]);
  const bySafety = (k: string) => (topics ?? []).filter(t => t.brand_safety === k && t.still_trending).length;
  const active = (topics ?? []).filter(t => t.still_trending);
  const avgDays = active.length ? active.reduce((s, t) => s + t.days_alive, 0) / active.length : 0;
  const chart = useMemo(() => hBarOption({
    data: rows.slice(0, 12).map(t => ({ name: t.title.length > 34 ? `${t.title.slice(0, 33)}…` : t.title, value: t.days_alive, color: SAFETY[t.brand_safety ?? '']?.color ?? '#a1a1aa' })),
    format: v => `${v} hari`, labelWidth: 230,
  }), [rows]);

  if (error) return <section className="state-panel" role="alert"><h3>Data umur topik belum bisa dimuat</h3><p>{error}</p></section>;
  if (topics === null) return <div className="state-panel"><Loader2 size={18} className="auth-spin" /><p>Memuat umur topik…</p></div>;
  if (!topics.length) return <section className="state-panel"><span className="state-icon"><Hourglass size={20} /></span><h3>Belum ada topik</h3><p>Topik dibuat saat skill “Metric Update The FYP Leak” dijalankan.</p></section>;

  return <div className="an-stack">
    <section className="kpi-grid fyp-kpis">
      <StatCard icon={<Hourglass size={18} />} label="Topik masih trending" value={active.length} sub={`rata-rata umur ${avgDays.toFixed(1)} hari`} tint="brand" hint="Umur dihitung dari tanggal mulai estimasi (berita atau video tertua) sampai hari ini, atau sampai terakhir terlihat jika sudah reda" />
      <StatCard icon={<ShieldCheck size={18} />} label="Aman di-riding" value={bySafety('aman')} sub="sentimen positif atau netral" tint="success" />
      <StatCard icon={<ShieldAlert size={18} />} label="Hati-hati" value={bySafety('hati-hati')} sub="boleh, dengan angle yang tepat" tint="warning" />
      <StatCard icon={<ShieldX size={18} />} label="Hindari" value={bySafety('hindari')} sub="duka, kriminal, politik, konflik" tint="destructive" />
    </section>

    <section className="panel">
      <header className="section-heading"><h2>Topik paling awet</h2><span className="muted-action">Warna = brand safety</span></header>
      <EChart option={chart} height={Math.max(160, Math.min(12, rows.length) * 30)} ariaLabel="Umur topik dalam hari" />
    </section>

    <section className="panel">
      <header className="section-heading"><h2>{rows.length} topik · umur, sentimen, brand safety</h2></header>
      <div className="flex flex-wrap items-center gap-1.5 pb-3">
        {(['all', 'aman', 'hati-hati', 'hindari'] as const).map(k => <button key={k} className={`filter-chip ${safety === k ? 'active' : ''}`} onClick={() => setSafety(k)}>{k === 'all' ? 'Semua' : SAFETY[k].label}</button>)}
        <button className={`filter-chip ${activeOnly ? 'active' : ''}`} onClick={() => setActiveOnly(!activeOnly)}>Masih trending saja</button>
        <label className="threads-select"><span>Kategori</span>
          <select value={category} onChange={e => setCategory(e.target.value)}>
            <option value="all">Semua kategori</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>
      <p className="fyp-note">Umur = hari sejak topik mulai (estimasi dari tanggal berita atau video tertua) sampai hari ini bila masih muncul di snapshot terbaru. Brand safety: aman boleh ditunggangi, hati-hati perlu angle edukatif atau netral, hindari jangan ditunggangi.</p>
      <div className="table-scroll"><table>
        <thead><tr><th></th><th>Topik</th><th>Kategori</th><th>Umur</th><th>Sejak</th><th>Status</th><th>Platform</th><th>Sentimen</th><th>Brand safety</th></tr></thead>
        <tbody>{rows.map(t => {
          const isOpen = open === t.topic_key;
          const sig = isOpen ? signals.filter(s => s.topic_key === t.topic_key) : [];
          const titles = [...new Map(sig.map(s => [`${s.source}|${s.title.toLowerCase()}`, s])).values()].slice(0, 12);
          const ctx = sig.find(s => s.context)?.context;
          const peak = compact(t.tiktok_peak_views);
          return [
            <tr key={t.topic_key} className="cursor-pointer" onClick={() => setOpen(isOpen ? null : t.topic_key)}>
              <td>{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
              <td><strong>{t.title}</strong></td>
              <td>{t.category ?? '–'}</td>
              <td><b>{t.days_alive}</b> hari</td>
              <td title={t.started_basis ?? ''}>{day(t.est_started_on)}</td>
              <td>{t.still_trending ? <span className="status-pill on">masih trending</span> : <span className="status-pill off">reda · {day(t.last_seen_wib)}</span>}</td>
              <td><span className="inline-flex flex-wrap gap-1">{t.sources.map(s => <span key={s} className="kw-tag">{SRC[s] ?? s}</span>)}{peak && <span className="kw-tag hm" title="Views tertinggi topik di TikTok">{peak} views</span>}</span></td>
              <td>{t.sentiment ? <span className={`status-pill ${SENTIMENT[t.sentiment]}`}>{t.sentiment}</span> : '–'}</td>
              <td title={t.safety_reason ?? ''}>{t.brand_safety ? <span className={`status-pill ${SAFETY[t.brand_safety].pill}`}>{SAFETY[t.brand_safety].label}</span> : '–'}</td>
            </tr>,
            isOpen && <tr key={`${t.topic_key}-d`}><td></td><td colSpan={8}>
              {t.safety_reason && <p className="fyp-context"><b>Alasan brand safety:</b> {t.safety_reason}</p>}
              {t.started_basis && <p className="fyp-note">Tanggal mulai: {t.started_basis}. Terlihat di {t.snapshots} snapshot, terakhir {new Date(t.last_seen_wib).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} WIB.</p>}
              {ctx && <p className="fyp-context">{ctx}</p>}
              <div className="flex flex-wrap gap-1 pt-1">{titles.map(s => <span key={`${s.source}${s.title}`} className="kw-tag">{SRC[s.source] ?? s.source}: {s.title}</span>)}</div>
            </td></tr>,
          ];
        })}</tbody>
      </table></div>
    </section>
  </div>;
}
