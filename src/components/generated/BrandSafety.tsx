import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ExternalLink, FileText, Loader2, Plus, Printer, RotateCw, ShieldAlert, ShieldCheck, Trash2, UserRound, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useIsSuperAdmin } from './ThreadsMonitor';
import './brand-safety.css';

// Brand Safety · background check of monitored accounts for a brand client.
// One case = one client request. Everything the report says is backed by a dated,
// sourced evidence row (bs_evidence); the score is derived from those rows only.

type Scope = 'quick' | 'standard' | 'deep';
type CaseStatus = 'open' | 'in_review' | 'done' | 'archived';
type Verdict = 'clear' | 'caution' | 'flag';
type Role = 'founder' | 'owner' | 'management';
type Case = { id: string; client_name: string; title: string; scope: Scope; check_content: boolean; check_founder: boolean; check_management: boolean; status: CaseStatus; definition: string | null; notes: string | null; created_at: string; updated_at: string };
type CaseAccount = { handle: string; kind: 'hm' | 'kol' | 'other'; verdict: Verdict | null; score: number | null; summary: string | null; followers: number | null; posts: number; persons: number; evidence: number };
type Category = { key: string; label: string; description: string; weight: number; sort: number };
type Evidence = { id: string; case_id: string | null; subject_type: 'account' | 'person' | 'entity'; subject_key: string; category: string; title: string; detail: string | null; url: string | null; source_tier: number; evidence_date: string | null; still_active: boolean; created_at: string };
type Person = { id: string; full_name: string; ig_handle: string | null; x_handle: string | null; tiktok_handle: string | null; linkedin_url: string | null; entity: string | null; notes: string | null };
type PersonLink = Person & { role: Role; title: string | null; source_url: string | null };
type SignalPost = { id: string; url: string; date: string; type: string; brand: string | null; collab: string | null; likes: number; comments: number; views: number; caption: string; signals: ('paid' | 'mention' | 'topic')[] };
type Signals = { handle: string; from: string | null; to: string | null; total: number; sponsored: number; gov_paid: number; gov_mention: number; gov_topic: number; posts: SignalPost[] };

const SCOPES: Record<Scope, { label: string; days: number; note: string }> = {
  quick: { label: 'Quick · 3 bulan', days: 92, note: 'Hanya 3 bulan terakhir. Cukup untuk cek cepat, tidak menangkap momen Pilpres/Pilkada.' },
  standard: { label: 'Standard · 12 bulan + jendela pemilu', days: 366, note: '12 bulan terakhir ditambah jendela Pilpres (Jan–Feb 2024) dan Pilkada (Okt–Des 2024).' },
  deep: { label: 'Deep · 24 bulan', days: 731, note: '24 bulan penuh, untuk brand besar atau kontrak jangka panjang.' },
};
const STATUS: Record<CaseStatus, string> = { open: 'Baru', in_review: 'Sedang dicek', done: 'Selesai', archived: 'Arsip' };
const VERDICT: Record<Verdict, { label: string; cls: string }> = { clear: { label: 'Aman', cls: 'on' }, caution: { label: 'Perlu perhatian', cls: 'warn' }, flag: { label: 'Berisiko', cls: 'bad' } };
const ROLES: Record<Role, string> = { founder: 'Founder', owner: 'Pemilik', management: 'Top manajemen' };
const TIERS: Record<number, string> = { 1: 'Dokumen resmi / pelantikan / KPU', 2: 'Media arus utama dengan atribusi', 3: 'Daftar / klaim pihak ketiga', 4: 'Post subjek sendiri' };
const TIER_MULT: Record<number, number> = { 1: 1, 2: 0.8, 3: 0.5, 4: 0.7 };
const MAX_MANAGEMENT = 2;

const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString('en-US');
const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '–');
const isoDaysAgo = (days: number) => new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
const normHandle = (h: string) => '@' + h.trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[/?#].*$/, '').replace(/^@+/, '').toLowerCase();

export function scoreOf(rows: Evidence[], cats: Record<string, Category>) {
  const raw = rows.reduce((s, e) => s + (cats[e.category]?.weight ?? 5) * (TIER_MULT[e.source_tier] ?? 0.5) * (e.still_active ? 1 : 0.5), 0);
  const score = Math.min(100, Math.round(raw));
  const suggested: Verdict = score >= 50 ? 'flag' : score >= 20 ? 'caution' : 'clear';
  return { score, suggested };
}

export function BrandSafety() {
  const [caseId, setCaseId] = useState<string | null>(null);
  const [cats, setCats] = useState<Record<string, Category>>({});
  useEffect(() => { supabase.from('bs_categories').select('*').order('sort').then(({ data }) => setCats(Object.fromEntries(((data ?? []) as Category[]).map(c => [c.key, c])))); }, []);
  return <section className="threads-monitor">
    {caseId ? <CaseDetail id={caseId} cats={cats} onBack={() => setCaseId(null)} /> : <CaseList onOpen={setCaseId} />}
  </section>;
}

// ------------------------------------------------------------------ cases
function CaseList({ onOpen }: { onOpen: (id: string) => void }) {
  const isAdmin = useIsSuperAdmin();
  const [rows, setRows] = useState<(Case & { accounts: number })[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const load = useCallback(async () => {
    setRows(null); setError(null);
    const { data, error } = await supabase.from('bs_cases').select('*, bs_case_accounts(count)').order('updated_at', { ascending: false });
    if (error) { setError(error.message); return; }
    setRows(((data ?? []) as (Case & { bs_case_accounts: { count: number }[] })[]).map(r => ({ ...r, accounts: r.bs_case_accounts?.[0]?.count ?? 0 })));
  }, []);
  useEffect(() => { load(); }, [load]);
  const remove = async (c: Case) => {
    if (!confirm(`Hapus case "${c.title}" (${c.client_name}) beserta akun dan buktinya?`)) return;
    const { error } = await supabase.from('bs_cases').delete().eq('id', c.id);
    if (error) alert(error.message); else load();
  };
  return <>
    <div className="threads-filters">
      <p className="threads-meta !m-0"><ShieldCheck size={14} />Background check akun untuk brand. Satu case = satu permintaan klien. Semua temuan disimpan sebagai bukti bertanggal dengan sumber.</p>
      <button className="state-btn !mt-0 !h-8 ml-auto" onClick={() => setCreating(true)}><Plus size={14} />Case baru</button>
    </div>
    {creating && <div className="mt-3"><CaseForm onClose={() => setCreating(false)} onSaved={id => { setCreating(false); onOpen(id); }} /></div>}
    <section className="panel mt-3">
      {error ? <p className="m-0 py-10 text-center text-[13px] text-red-400">{error.includes('bs_cases') ? 'Tabel Brand Safety belum ada. Jalankan migration 20261106000000_brand_safety.sql di Supabase.' : error}</p>
        : rows === null ? <div className="flex justify-center py-10"><Loader2 size={18} className="auth-spin" /></div>
        : !rows.length ? <p className="m-0 py-10 text-center text-[13px] text-zinc-500">Belum ada case. Mulai dengan "Case baru".</p>
        : <div className="table-scroll"><table>
          <thead><tr><th>Klien</th><th>Case</th><th>Cakupan</th><th>Cek</th><th>Akun</th><th>Status</th><th>Diperbarui</th>{isAdmin && <th />}</tr></thead>
          <tbody>{rows.map(c => <tr key={c.id} className="cursor-pointer" onClick={() => onOpen(c.id)}>
            <td><strong>{c.client_name}</strong></td>
            <td>{c.title}</td>
            <td>{SCOPES[c.scope].label.split(' · ')[0]}</td>
            <td className="text-zinc-400">{[c.check_content && 'konten', c.check_founder && 'founder', c.check_management && 'manajemen'].filter(Boolean).join(' · ') || '–'}</td>
            <td>{c.accounts}</td>
            <td><span className={`status-pill ${c.status === 'done' ? 'on' : c.status === 'in_review' ? 'run' : 'off'}`}>{STATUS[c.status]}</span></td>
            <td>{day(c.updated_at)}</td>
            {isAdmin && <td onClick={e => e.stopPropagation()}><button className="icon-btn danger" onClick={() => remove(c)} aria-label="Hapus"><Trash2 size={14} /></button></td>}
          </tr>)}</tbody>
        </table></div>}
    </section>
  </>;
}

function CaseForm({ initial, onClose, onSaved }: { initial?: Case; onClose: () => void; onSaved: (id: string) => void }) {
  const [d, setD] = useState({ client_name: initial?.client_name ?? '', title: initial?.title ?? '', scope: initial?.scope ?? 'standard' as Scope, check_content: initial?.check_content ?? true, check_founder: initial?.check_founder ?? true, check_management: initial?.check_management ?? true, definition: initial?.definition ?? '', status: initial?.status ?? 'open' as CaseStatus, notes: initial?.notes ?? '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<typeof d>) => setD({ ...d, ...p });
  const save = async () => {
    if (!d.client_name.trim() || !d.title.trim()) return setErr('Nama klien dan judul case wajib diisi.');
    setSaving(true); setErr(null);
    const row = { ...d, client_name: d.client_name.trim(), title: d.title.trim(), definition: d.definition.trim() || null, notes: d.notes.trim() || null };
    const res = initial ? await supabase.from('bs_cases').update(row).eq('id', initial.id).select('id').single() : await supabase.from('bs_cases').insert(row).select('id').single();
    setSaving(false);
    if (res.error) return setErr(res.error.message);
    onSaved((res.data as { id: string }).id);
  };
  return <div className="topic-form">
    <div className="flex items-center justify-between"><h3>{initial ? 'Ubah case' : 'Case baru'}</h3><button className="icon-btn" onClick={onClose} aria-label="Tutup"><X size={14} /></button></div>
    <div className="grid gap-3 md:grid-cols-3">
      <label>Nama klien / brand<input value={d.client_name} onChange={e => set({ client_name: e.target.value })} placeholder="mis. Brand X" autoFocus /></label>
      <label>Judul case<input value={d.title} onChange={e => set({ title: e.target.value })} placeholder="mis. Seleksi akun kampanye Q1 2027" /></label>
      <label>Cakupan scan<select value={d.scope} onChange={e => set({ scope: e.target.value as Scope })}>{(Object.keys(SCOPES) as Scope[]).map(s => <option key={s} value={s}>{SCOPES[s].label}</option>)}</select></label>
    </div>
    <small>{SCOPES[d.scope].note}</small>
    <div className="grid gap-3 md:grid-cols-3">
      <label className="check"><input type="checkbox" checked={d.check_content} onChange={e => set({ check_content: e.target.checked })} />Scan konten akun</label>
      <label className="check"><input type="checkbox" checked={d.check_founder} onChange={e => set({ check_founder: e.target.checked })} />Cek founder / pemilik</label>
      <label className="check"><input type="checkbox" checked={d.check_management} onChange={e => set({ check_management: e.target.checked })} />Cek top manajemen (maks. {MAX_MANAGEMENT} orang)</label>
    </div>
    <label>Definisi "afiliasi" menurut klien<textarea rows={2} value={d.definition} onChange={e => set({ definition: e.target.value })} placeholder="mis. Pemerintah pusat & BUMN; pernah dibayar instansi = perlu perhatian; jabatan formal = berisiko" /></label>
    {initial && <div className="grid gap-3 md:grid-cols-2">
      <label>Status<select value={d.status} onChange={e => set({ status: e.target.value as CaseStatus })}>{(Object.keys(STATUS) as CaseStatus[]).map(s => <option key={s} value={s}>{STATUS[s]}</option>)}</select></label>
      <label>Catatan internal<input value={d.notes} onChange={e => set({ notes: e.target.value })} /></label>
    </div>}
    {err && <p className="m-0 text-[12px] text-red-400">{err}</p>}
    <div className="flex gap-2">
      <button className="state-btn !mt-0" onClick={save} disabled={saving}>{saving && <Loader2 size={14} className="auth-spin" />}{initial ? 'Simpan' : 'Buat case'}</button>
      <button className="filter-chip" onClick={onClose}>Batal</button>
    </div>
  </div>;
}

// ------------------------------------------------------------------ case detail
function CaseDetail({ id, cats, onBack }: { id: string; cats: Record<string, Category>; onBack: () => void }) {
  const [c, setC] = useState<Case | null>(null);
  const [accounts, setAccounts] = useState<CaseAccount[] | null>(null);
  const [known, setKnown] = useState<{ handle: string; kind: 'hm' | 'kol' }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [report, setReport] = useState(false);
  const [newHandle, setNewHandle] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    const [{ data: cs }, { data: ov }] = await Promise.all([supabase.from('bs_cases').select('*').eq('id', id).single(), supabase.rpc('bs_case_overview', { p_case: id })]);
    setC(cs as Case); setAccounts((ov ?? []) as CaseAccount[]);
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    Promise.all([supabase.from('accounts').select('handle'), supabase.from('kol_accounts').select('handle')]).then(([a, k]) =>
      setKnown([...((a.data ?? []) as { handle: string }[]).map(r => ({ handle: r.handle, kind: 'hm' as const })), ...((k.data ?? []) as { handle: string }[]).map(r => ({ handle: r.handle, kind: 'kol' as const }))]));
  }, []);
  const addAccount = async () => {
    const handle = normHandle(newHandle);
    if (!/^@[a-z0-9._]{1,30}$/.test(handle)) return setErr('Handle tidak valid.');
    if (accounts?.some(a => a.handle === handle)) return setErr(`${handle} sudah ada di case ini.`);
    const kind = known.find(k => k.handle.toLowerCase() === handle)?.kind ?? 'other';
    const { error } = await supabase.from('bs_case_accounts').insert({ case_id: id, handle, kind });
    if (error) return setErr(error.message);
    setNewHandle(''); setErr(null); load(); setSelected(handle);
  };
  const removeAccount = async (h: string) => {
    if (!confirm(`Keluarkan ${h} dari case ini? Bukti global & data orang tetap tersimpan.`)) return;
    await supabase.from('bs_case_accounts').delete().eq('case_id', id).eq('handle', h);
    if (selected === h) setSelected(null);
    load();
  };
  if (!c) return <div className="flex justify-center py-10"><Loader2 size={18} className="auth-spin" /></div>;
  const current = accounts?.find(a => a.handle === selected) ?? null;
  return <>
    <div className="threads-filters">
      <button className="filter-chip inline-flex items-center gap-1.5" onClick={onBack}><ArrowLeft size={13} />Semua case</button>
      <div className="min-w-0"><strong className="text-[14px] text-zinc-100">{c.client_name}</strong><span className="mx-2 text-zinc-600">›</span><span className="text-[13px] text-zinc-300">{c.title}</span></div>
      <span className={`status-pill ${c.status === 'done' ? 'on' : c.status === 'in_review' ? 'run' : 'off'}`}>{STATUS[c.status]}</span>
      <div className="ml-auto flex gap-1.5">
        <button className="filter-chip inline-flex items-center gap-1.5" onClick={() => setReport(true)} disabled={!accounts?.length}><FileText size={13} />Laporan</button>
        <button className="filter-chip inline-flex items-center gap-1.5" onClick={() => setEditing(true)}>Ubah case</button>
      </div>
    </div>
    <p className="threads-meta">{SCOPES[c.scope].label} · cek: {[c.check_content && 'konten', c.check_founder && 'founder/pemilik', c.check_management && `top manajemen (maks. ${MAX_MANAGEMENT})`].filter(Boolean).join(', ') || '–'}{c.definition && <> · definisi klien: <em className="text-zinc-300">{c.definition}</em></>}</p>
    {editing && <div className="mt-3"><CaseForm initial={c} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} /></div>}
    {report && accounts && <ReportView c={c} accounts={accounts} cats={cats} onClose={() => setReport(false)} />}

    <div className="mt-3 grid gap-3 lg:grid-cols-[280px_1fr]">
      <section className="panel !p-4">
        <div className="section-heading !mb-3"><h2>Akun dicek ({accounts?.length ?? 0})</h2></div>
        <div className="flex gap-1.5">
          <input className="min-w-0 flex-1 rounded-lg border border-[#3f3f46] bg-[#18181b] px-2.5 py-1.5 text-[13px] text-zinc-100 outline-none focus:border-[#ff743d]" list="bs-known" value={newHandle} onChange={e => setNewHandle(e.target.value)} onKeyDown={e => e.key === 'Enter' && addAccount()} placeholder="@akun" />
          <datalist id="bs-known">{known.map(k => <option key={k.handle} value={k.handle} />)}</datalist>
          <button className="state-btn !mt-0 !h-8 !px-2.5" onClick={addAccount} aria-label="Tambah akun"><Plus size={14} /></button>
        </div>
        {err && <p className="m-0 mt-2 text-[12px] text-red-400">{err}</p>}
        <ul className="m-0 mt-3 list-none p-0">
          {accounts?.map(a => <li key={a.handle} className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer ${selected === a.handle ? 'bg-[#27272a]' : 'hover:bg-[#18181b]'}`} onClick={() => setSelected(a.handle)}>
            <span className="account-avatar !m-0">{a.handle.slice(1, 2).toUpperCase()}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-[13px] text-zinc-100">{a.handle}</span><span className="block text-[11px] text-zinc-500">{a.kind === 'other' ? 'belum dipantau' : `${fmt(a.followers)} followers`} · {a.evidence} bukti · {a.persons} orang</span></span>
            {a.verdict ? <span className={`status-pill ${VERDICT[a.verdict].cls}`}>{a.score}</span> : <span className="status-pill off">–</span>}
            <button className="icon-btn !h-6 !w-6 opacity-0 group-hover:opacity-100" onClick={e => { e.stopPropagation(); removeAccount(a.handle); }} aria-label="Keluarkan"><X size={12} /></button>
          </li>)}
          {accounts && !accounts.length && <li className="py-6 text-center text-[12px] text-zinc-500">Tambahkan akun yang diminta klien.</li>}
        </ul>
      </section>
      {current ? <AccountPanel key={current.handle} c={c} acc={current} cats={cats} onChanged={load} /> : <section className="panel flex items-center justify-center text-[13px] text-zinc-500">Pilih akun di kiri untuk mulai mengecek.</section>}
    </div>
  </>;
}

// ------------------------------------------------------------------ one account inside a case
function AccountPanel({ c, acc, cats, onChanged }: { c: Case; acc: CaseAccount; cats: Record<string, Category>; onChanged: () => void }) {
  const tabsAvail = [c.check_content && 'content', (c.check_founder || c.check_management) && 'people', 'evidence', 'verdict'].filter(Boolean) as ('content' | 'people' | 'evidence' | 'verdict')[];
  const [tab, setTab] = useState(tabsAvail[0]);
  const [people, setPeople] = useState<PersonLink[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { data: links } = await supabase.from('person_accounts').select('role, title, source_url, persons(*)').eq('handle', acc.handle);
    const ppl = ((links ?? []) as unknown as { role: Role; title: string | null; source_url: string | null; persons: Person }[]).map(l => ({ ...l.persons, role: l.role, title: l.title, source_url: l.source_url }));
    setPeople(ppl);
    const keys = [acc.handle, ...ppl.map(p => p.id)];
    const { data: ev } = await supabase.from('bs_evidence').select('*').in('subject_key', keys).order('evidence_date', { ascending: false, nullsFirst: false });
    setEvidence(((ev ?? []) as Evidence[]).filter(e => e.subject_type === 'account' ? e.subject_key.toLowerCase() === acc.handle.toLowerCase() : true));
  }, [acc.handle]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); }, [toast]);
  const changed = () => { load(); onChanged(); };
  const labels = { content: 'Konten', people: 'Founder & manajemen', evidence: `Bukti (${evidence.length})`, verdict: 'Skor & verdict' };
  return <section className="panel !p-4">
    <div className="flex flex-wrap items-center gap-2">
      <span className="account-avatar !m-0">{acc.handle.slice(1, 2).toUpperCase()}</span>
      <a href={`https://www.instagram.com/${acc.handle.slice(1)}/`} target="_blank" rel="noreferrer" className="text-[15px] font-medium text-zinc-100 hover:underline">{acc.handle}</a>
      <span className="text-[12px] text-zinc-500">{acc.kind === 'other' ? 'tidak dipantau di Brand Monitor' : `${fmt(acc.followers)} followers · ${fmt(acc.posts)} post tersimpan`}</span>
      {toast && <span className="ml-auto text-[12px] text-emerald-300">{toast}</span>}
    </div>
    <nav className="tab-nav mt-2" aria-label="Bagian">{tabsAvail.map(t => <button key={t} className={tab === t ? 'tab-pill active' : 'tab-pill'} onClick={() => setTab(t)}>{labels[t]}</button>)}</nav>
    <div className="mt-3">
      {tab === 'content' && <ContentSignals c={c} handle={acc.handle} onEvidence={async p => {
        const category = p.signals.includes('paid') ? 'paid_government_content' : 'political_content_pattern';
        const title = p.signals.includes('paid') ? `Post berbayar: ${p.brand}` : `Post bertopik pemerintahan${p.collab ? ` (kolab ${p.collab})` : ''}`;
        const { error } = await supabase.from('bs_evidence').insert({ case_id: c.id, subject_type: 'account', subject_key: acc.handle, category, title, detail: p.caption, url: p.url, source_tier: 4, evidence_date: p.date, still_active: true });
        if (error) alert(error.message); else { setToast('Ditambahkan ke bukti'); changed(); }
      }} />}
      {tab === 'people' && <PeoplePanel c={c} handle={acc.handle} people={people} evidence={evidence} cats={cats} onChanged={changed} />}
      {tab === 'evidence' && <EvidencePanel c={c} handle={acc.handle} people={people} evidence={evidence} cats={cats} onChanged={changed} />}
      {tab === 'verdict' && <VerdictPanel c={c} acc={acc} evidence={evidence} cats={cats} onSaved={() => { setToast('Verdict tersimpan'); onChanged(); }} />}
    </div>
  </section>;
}

function ContentSignals({ c, handle, onEvidence }: { c: Case; handle: string; onEvidence: (p: SignalPost) => void }) {
  const [sig, setSig] = useState<Signals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const from = isoDaysAgo(SCOPES[c.scope].days);
  const load = useCallback(async () => {
    setSig(null); setError(null);
    const { data, error } = await supabase.rpc('bs_content_signals', { p_handle: handle, p_from: from, p_to: null });
    if (error) setError(error.message); else setSig(data as Signals);
  }, [handle, from]);
  useEffect(() => { load(); }, [load]);
  if (error) return <p className="m-0 text-[13px] text-red-400">{error}</p>;
  if (!sig) return <div className="flex justify-center py-8"><Loader2 size={18} className="auth-spin" /></div>;
  const pct = (n: number) => sig.total ? ` (${(n / sig.total * 100).toFixed(1)}%)` : '';
  const sigLabel = { paid: 'berbayar pemerintah/BUMN', mention: 'kolab akun resmi', topic: 'topik pemerintahan' };
  return <>
    <div className="kpi-grid !my-0 !grid-cols-2 md:!grid-cols-4">
      {[['Post dalam jendela', fmt(sig.total)], ['Berbayar dari pemerintah/BUMN', fmt(sig.gov_paid) + pct(sig.gov_paid)], ['Kolab dengan akun resmi', fmt(sig.gov_mention) + pct(sig.gov_mention)], ['Bertopik pemerintahan', fmt(sig.gov_topic) + pct(sig.gov_topic)]].map(([l, v]) => <div key={l} className="kpi-card !p-3"><div><p className="m-0 text-[11px] text-zinc-500">{l}</p><p className="m-0 mt-1 text-[18px] font-medium text-zinc-100">{v}</p></div></div>)}
    </div>
    <p className="panel-note">Jendela {day(sig.from)} – {day(sig.to)} dari data yang sudah tersimpan di Brand Monitor. {SCOPES[c.scope].note} Post di luar data tersimpan perlu scan history (job scraping) terlebih dahulu.<button className="icon-btn !h-6 !w-6 ml-1" onClick={load} aria-label="Muat ulang"><RotateCw size={12} /></button></p>
    {sig.posts.length ? <div className="table-scroll mt-3"><table>
      <thead><tr><th>Tanggal</th><th>Sinyal</th><th>Brand / kolab</th><th>Caption</th><th>Likes</th><th /></tr></thead>
      <tbody>{sig.posts.map(p => <tr key={p.id}>
        <td>{day(p.date)}</td>
        <td><div className="flex flex-wrap gap-1">{p.signals.map(s => <span key={s} className={`status-pill ${s === 'paid' ? 'warn' : 'off'}`}>{sigLabel[s]}</span>)}</div></td>
        <td>{p.brand ?? p.collab ?? '–'}</td>
        <td className="!whitespace-normal max-w-[420px] text-[12px] text-zinc-400">{p.caption}</td>
        <td>{fmt(p.likes)}</td>
        <td><div className="topic-actions justify-end"><a className="icon-btn" href={p.url} target="_blank" rel="noreferrer" aria-label="Buka post"><ExternalLink size={13} /></a><button className="icon-btn" title="Jadikan bukti" onClick={() => onEvidence(p)}><Plus size={13} /></button></div></td>
      </tr>)}</tbody>
    </table></div> : <p className="m-0 mt-3 text-[13px] text-zinc-500">Tidak ada post dengan sinyal pemerintahan dalam jendela ini.</p>}
  </>;
}

function PeoplePanel({ c, handle, people, evidence, cats, onChanged }: { c: Case; handle: string; people: PersonLink[]; evidence: Evidence[]; cats: Record<string, Category>; onChanged: () => void }) {
  const [adding, setAdding] = useState<Role | null>(null);
  const [evFor, setEvFor] = useState<Person | null>(null);
  const mgmt = people.filter(p => p.role === 'management').length;
  const unlink = async (p: PersonLink) => {
    if (!confirm(`Lepas ${p.full_name} (${ROLES[p.role]}) dari ${handle}? Data orang & buktinya tetap tersimpan.`)) return;
    await supabase.from('person_accounts').delete().eq('person_id', p.id).eq('handle', handle).eq('role', p.role);
    onChanged();
  };
  return <>
    <div className="flex flex-wrap gap-1.5">
      {c.check_founder && <><button className="filter-chip inline-flex items-center gap-1.5" onClick={() => setAdding('founder')}><Plus size={12} />Founder</button><button className="filter-chip inline-flex items-center gap-1.5" onClick={() => setAdding('owner')}><Plus size={12} />Pemilik / badan usaha</button></>}
      {c.check_management && <button className="filter-chip inline-flex items-center gap-1.5" disabled={mgmt >= MAX_MANAGEMENT} title={mgmt >= MAX_MANAGEMENT ? `Maksimal ${MAX_MANAGEMENT} orang manajemen` : ''} onClick={() => setAdding('management')}><Plus size={12} />Top manajemen ({mgmt}/{MAX_MANAGEMENT})</button>}
    </div>
    {adding && <div className="mt-3"><PersonForm handle={handle} role={adding} onClose={() => setAdding(null)} onSaved={() => { setAdding(null); onChanged(); }} /></div>}
    {evFor && <div className="mt-3"><EvidenceForm c={c} subject={{ type: 'person', key: evFor.id, label: evFor.full_name }} cats={cats} onClose={() => setEvFor(null)} onSaved={() => { setEvFor(null); onChanged(); }} /></div>}
    <div className="mt-3 grid gap-3 md:grid-cols-2">
      {people.map(p => {
        const ev = evidence.filter(e => e.subject_type === 'person' && e.subject_key === p.id);
        const { score } = scoreOf(ev, cats);
        return <article key={p.id + p.role} className="rounded-xl border border-[#27272a] bg-[#09090b] p-3">
          <div className="flex items-start gap-2">
            <span className="account-avatar !m-0 !h-8 !w-8 !rounded-full"><UserRound size={14} /></span>
            <div className="min-w-0 flex-1">
              <p className="m-0 text-[13px] font-medium text-zinc-100">{p.full_name}</p>
              <p className="m-0 text-[11.5px] text-zinc-500">{ROLES[p.role]}{p.title ? ` · ${p.title}` : ''}{p.entity ? ` · ${p.entity}` : ''}</p>
              <p className="m-0 mt-1 flex flex-wrap gap-x-3 text-[11.5px]">
                {p.ig_handle && <a className="text-zinc-300 hover:underline" href={`https://www.instagram.com/${p.ig_handle.replace(/^@/, '')}/`} target="_blank" rel="noreferrer">IG {p.ig_handle}</a>}
                {p.x_handle && <a className="text-zinc-300 hover:underline" href={`https://x.com/${p.x_handle.replace(/^@/, '')}`} target="_blank" rel="noreferrer">X {p.x_handle}</a>}
                {p.tiktok_handle && <a className="text-zinc-300 hover:underline" href={`https://www.tiktok.com/@${p.tiktok_handle.replace(/^@/, '')}`} target="_blank" rel="noreferrer">TikTok</a>}
                {p.linkedin_url && <a className="text-zinc-300 hover:underline" href={p.linkedin_url} target="_blank" rel="noreferrer">LinkedIn</a>}
                {p.source_url && <a className="text-zinc-500 hover:underline" href={p.source_url} target="_blank" rel="noreferrer">sumber peran</a>}
              </p>
            </div>
            <span className={`status-pill ${score >= 50 ? 'bad' : score >= 20 ? 'warn' : 'on'}`}>{ev.length} bukti · {score}</span>
          </div>
          {p.notes && <p className="m-0 mt-2 text-[12px] text-zinc-400">{p.notes}</p>}
          <ul className="m-0 mt-2 list-none p-0 text-[12px]">{ev.slice(0, 4).map(e => <li key={e.id} className="flex gap-2 py-1 border-t border-[#27272a]"><span className="text-zinc-500 shrink-0">{day(e.evidence_date)}</span><span className="text-zinc-300">{cats[e.category]?.label ?? e.category}: {e.title}</span></li>)}</ul>
          <div className="mt-2 flex gap-1.5">
            <button className="filter-chip inline-flex items-center gap-1" onClick={() => setEvFor(p)}><Plus size={12} />Bukti</button>
            <button className="filter-chip" onClick={() => unlink(p)}>Lepas</button>
          </div>
        </article>;
      })}
      {!people.length && <p className="m-0 py-6 text-[13px] text-zinc-500 md:col-span-2">Belum ada orang yang ditautkan. Cari founder/pemilik lewat bio Instagram, Linktree, berita, dan Ditjen AHU, lalu tambahkan di sini beserta sumbernya.</p>}
    </div>
  </>;
}

function PersonForm({ handle, role, onClose, onSaved }: { handle: string; role: Role; onClose: () => void; onSaved: () => void }) {
  const [existing, setExisting] = useState<Person[]>([]);
  const [pick, setPick] = useState('');
  const [d, setD] = useState({ full_name: '', ig_handle: '', x_handle: '', tiktok_handle: '', linkedin_url: '', entity: '', notes: '', title: '', source_url: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { supabase.from('persons').select('*').order('full_name').then(({ data }) => setExisting((data ?? []) as Person[])); }, []);
  const set = (p: Partial<typeof d>) => setD({ ...d, ...p });
  const save = async () => {
    setErr(null);
    let personId = pick;
    if (!personId) {
      if (!d.full_name.trim()) return setErr('Nama wajib diisi.');
      setSaving(true);
      const { data, error } = await supabase.from('persons').insert({ full_name: d.full_name.trim(), ig_handle: d.ig_handle.trim() ? normHandle(d.ig_handle) : null, x_handle: d.x_handle.trim() || null, tiktok_handle: d.tiktok_handle.trim() || null, linkedin_url: d.linkedin_url.trim() || null, entity: d.entity.trim() || null, notes: d.notes.trim() || null }).select('id').single();
      if (error) { setSaving(false); return setErr(error.message); }
      personId = (data as { id: string }).id;
    }
    setSaving(true);
    const { error } = await supabase.from('person_accounts').insert({ person_id: personId, handle, role, title: d.title.trim() || null, source_url: d.source_url.trim() || null });
    setSaving(false);
    if (error) return setErr(error.code === '23505' ? 'Orang ini sudah ditautkan dengan peran yang sama.' : error.message);
    onSaved();
  };
  return <div className="topic-form">
    <div className="flex items-center justify-between"><h3>Tambah {ROLES[role].toLowerCase()} untuk {handle}</h3><button className="icon-btn" onClick={onClose} aria-label="Tutup"><X size={14} /></button></div>
    {existing.length > 0 && <label>Pilih orang yang sudah ada<select value={pick} onChange={e => setPick(e.target.value)}><option value="">— orang baru —</option>{existing.map(p => <option key={p.id} value={p.id}>{p.full_name}{p.entity ? ` (${p.entity})` : ''}</option>)}</select></label>}
    {!pick && <>
      <div className="grid gap-3 md:grid-cols-3">
        <label>Nama lengkap<input value={d.full_name} onChange={e => set({ full_name: e.target.value })} autoFocus /></label>
        <label>Badan usaha / grup<input value={d.entity} onChange={e => set({ entity: e.target.value })} placeholder="mis. PT …" /></label>
        <label>Instagram<input value={d.ig_handle} onChange={e => set({ ig_handle: e.target.value })} placeholder="@…" /></label>
        <label>X / Twitter<input value={d.x_handle} onChange={e => set({ x_handle: e.target.value })} placeholder="@…" /></label>
        <label>TikTok<input value={d.tiktok_handle} onChange={e => set({ tiktok_handle: e.target.value })} placeholder="@…" /></label>
        <label>LinkedIn URL<input value={d.linkedin_url} onChange={e => set({ linkedin_url: e.target.value })} placeholder="https://www.linkedin.com/in/…" /></label>
      </div>
      <label>Catatan<input value={d.notes} onChange={e => set({ notes: e.target.value })} placeholder="ringkasan latar belakang (tanpa kesimpulan politik)" /></label>
    </>}
    <div className="grid gap-3 md:grid-cols-2">
      <label>Jabatan di akun ini<input value={d.title} onChange={e => set({ title: e.target.value })} placeholder={role === 'management' ? 'mis. CEO, Head of Content' : 'mis. Co-founder'} /></label>
      <label>Sumber peran (URL)<input value={d.source_url} onChange={e => set({ source_url: e.target.value })} placeholder="bio IG / berita / AHU" /></label>
    </div>
    <small>Hanya informasi publik. Akun privat dicatat sebagai "tidak dapat diverifikasi". Jangan menyimpulkan sikap politik; simpan sebagai bukti bertanggal di tab Bukti.</small>
    {err && <p className="m-0 text-[12px] text-red-400">{err}</p>}
    <div className="flex gap-2"><button className="state-btn !mt-0" onClick={save} disabled={saving}>{saving && <Loader2 size={14} className="auth-spin" />}Tautkan</button><button className="filter-chip" onClick={onClose}>Batal</button></div>
  </div>;
}

function EvidencePanel({ c, handle, people, evidence, cats, onChanged }: { c: Case; handle: string; people: PersonLink[]; evidence: Evidence[]; cats: Record<string, Category>; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const subjectLabel = (e: Evidence) => e.subject_type === 'account' ? e.subject_key : people.find(p => p.id === e.subject_key)?.full_name ?? e.subject_key;
  const remove = async (e: Evidence) => { if (!confirm(`Hapus bukti "${e.title}"?`)) return; const { error } = await supabase.from('bs_evidence').delete().eq('id', e.id); if (error) alert(error.message); else onChanged(); };
  return <>
    <div className="flex items-center gap-2"><button className="state-btn !mt-0 !h-8" onClick={() => setAdding(true)}><Plus size={14} />Tambah bukti</button><span className="text-[12px] text-zinc-500">Bukti untuk akun ini dan orang-orang yang ditautkan. Bukti tanpa case bersifat global (dipakai ulang di case berikutnya).</span></div>
    {adding && <div className="mt-3"><EvidenceForm c={c} subject={{ type: 'account', key: handle, label: handle }} people={people} cats={cats} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); onChanged(); }} /></div>}
    {evidence.length ? <div className="table-scroll mt-3"><table>
      <thead><tr><th>Tanggal</th><th>Subjek</th><th>Kategori</th><th>Bukti</th><th>Sumber</th><th>Status</th><th /></tr></thead>
      <tbody>{evidence.map(e => <tr key={e.id}>
        <td>{day(e.evidence_date)}</td>
        <td>{subjectLabel(e)}</td>
        <td><span className="status-pill off">{cats[e.category]?.label ?? e.category}</span></td>
        <td className="!whitespace-normal max-w-[380px]"><span className="text-zinc-100">{e.title}</span>{e.detail && <span className="block text-[12px] text-zinc-500">{e.detail}</span>}</td>
        <td>{e.url ? <a className="inline-flex items-center gap-1 hover:underline" href={e.url} target="_blank" rel="noreferrer">Tier {e.source_tier}<ExternalLink size={11} /></a> : `Tier ${e.source_tier}`}</td>
        <td><span className={`status-pill ${e.still_active ? 'warn' : 'off'}`}>{e.still_active ? 'masih berlaku' : 'historis'}</span></td>
        <td><button className="icon-btn danger" onClick={() => remove(e)} aria-label="Hapus"><Trash2 size={13} /></button></td>
      </tr>)}</tbody>
    </table></div> : <p className="m-0 mt-3 text-[13px] text-zinc-500">Belum ada bukti. Tambahkan dari tab Konten (post bersinyal) atau manual di sini.</p>}
  </>;
}

function EvidenceForm({ c, subject, people = [], cats, onClose, onSaved }: { c: Case; subject: { type: 'account' | 'person'; key: string; label: string }; people?: PersonLink[]; cats: Record<string, Category>; onClose: () => void; onSaved: () => void }) {
  const list = Object.values(cats).sort((a, b) => a.sort - b.sort);
  const [d, setD] = useState({ subject_key: subject.key, category: list[0]?.key ?? 'other', title: '', detail: '', url: '', source_tier: 2, evidence_date: '', still_active: true, global: false });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<typeof d>) => setD({ ...d, ...p });
  const subjType = d.subject_key === subject.key && subject.type === 'account' ? 'account' : 'person';
  const save = async () => {
    if (!d.title.trim()) return setErr('Judul bukti wajib diisi.');
    setSaving(true); setErr(null);
    const { error } = await supabase.from('bs_evidence').insert({ case_id: d.global ? null : c.id, subject_type: subjType, subject_key: d.subject_key, category: d.category, title: d.title.trim(), detail: d.detail.trim() || null, url: d.url.trim() || null, source_tier: d.source_tier, evidence_date: d.evidence_date || null, still_active: d.still_active });
    setSaving(false);
    if (error) return setErr(error.message);
    onSaved();
  };
  return <div className="topic-form">
    <div className="flex items-center justify-between"><h3>Tambah bukti</h3><button className="icon-btn" onClick={onClose} aria-label="Tutup"><X size={14} /></button></div>
    <div className="grid gap-3 md:grid-cols-3">
      <label>Subjek<select value={d.subject_key} onChange={e => set({ subject_key: e.target.value })}><option value={subject.key}>{subject.label}</option>{subject.type === 'account' && people.map(p => <option key={p.id} value={p.id}>{p.full_name} ({ROLES[p.role]})</option>)}</select></label>
      <label>Kategori<select value={d.category} onChange={e => set({ category: e.target.value })}>{list.map(k => <option key={k.key} value={k.key}>{k.label} · bobot {k.weight}</option>)}</select></label>
      <label>Tanggal kejadian<input type="date" value={d.evidence_date} onChange={e => set({ evidence_date: e.target.value })} /></label>
    </div>
    <small>{cats[d.category]?.description}</small>
    <label>Judul bukti (fakta, bukan kesimpulan)<input value={d.title} onChange={e => set({ title: e.target.value })} placeholder='mis. "Dilantik sebagai Stafsus Menkomdigi, 13 Jan 2025"' autoFocus /></label>
    <label>Detail / kutipan<textarea rows={2} value={d.detail} onChange={e => set({ detail: e.target.value })} /></label>
    <div className="grid gap-3 md:grid-cols-3">
      <label>URL sumber<input value={d.url} onChange={e => set({ url: e.target.value })} placeholder="https://…" /></label>
      <label>Kualitas sumber<select value={d.source_tier} onChange={e => set({ source_tier: Number(e.target.value) })}>{[1, 2, 3, 4].map(t => <option key={t} value={t}>Tier {t} · {TIERS[t]}</option>)}</select></label>
      <div className="grid gap-1">
        <label className="check !pb-0"><input type="checkbox" checked={d.still_active} onChange={e => set({ still_active: e.target.checked })} />Masih berlaku (mis. masih menjabat)</label>
        <label className="check !pb-0"><input type="checkbox" checked={d.global} onChange={e => set({ global: e.target.checked })} />Bukti global (dipakai ulang di case lain)</label>
      </div>
    </div>
    {err && <p className="m-0 text-[12px] text-red-400">{err}</p>}
    <div className="flex gap-2"><button className="state-btn !mt-0" onClick={save} disabled={saving}>{saving && <Loader2 size={14} className="auth-spin" />}Simpan bukti</button><button className="filter-chip" onClick={onClose}>Batal</button></div>
  </div>;
}

function VerdictPanel({ c, acc, evidence, cats, onSaved }: { c: Case; acc: CaseAccount; evidence: Evidence[]; cats: Record<string, Category>; onSaved: () => void }) {
  const { score, suggested } = scoreOf(evidence, cats);
  const [verdict, setVerdict] = useState<Verdict>(acc.verdict ?? suggested);
  const [summary, setSummary] = useState(acc.summary ?? '');
  const [saving, setSaving] = useState(false);
  const byCat = useMemo(() => Object.values(cats).sort((a, b) => a.sort - b.sort).map(k => ({ k, n: evidence.filter(e => e.category === k.key).length })).filter(x => x.n), [cats, evidence]);
  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('bs_case_accounts').update({ verdict, score, summary: summary.trim() || null, reviewed_at: new Date().toISOString() }).eq('case_id', c.id).eq('handle', acc.handle);
    setSaving(false);
    if (error) alert(error.message); else onSaved();
  };
  return <div className="grid gap-3 md:grid-cols-[220px_1fr]">
    <div className="rounded-xl border border-[#27272a] bg-[#09090b] p-4 text-center">
      <p className="m-0 text-[11px] uppercase tracking-wide text-zinc-500">Skor risiko</p>
      <p className={`m-0 mt-1 text-[44px] font-semibold leading-none ${score >= 50 ? 'text-[#ff8f86]' : score >= 20 ? 'text-[#ff9466]' : 'text-[#8eeab0]'}`}>{score}</p>
      <p className="m-0 mt-1 text-[12px] text-zinc-500">dari 100 · {evidence.length} bukti</p>
      <p className="m-0 mt-3 text-[12px] text-zinc-400">Saran: <span className={`status-pill ${VERDICT[suggested].cls}`}>{VERDICT[suggested].label}</span></p>
      <ul className="m-0 mt-3 list-none p-0 text-left text-[12px]">{byCat.map(({ k, n }) => <li key={k.key} className="flex justify-between gap-2 border-t border-[#27272a] py-1"><span className="text-zinc-400">{k.label}</span><span className="text-zinc-200">{n}</span></li>)}</ul>
    </div>
    <div className="topic-form !mb-0">
      <h3>Verdict untuk klien</h3>
      <small>Skor = Σ bobot kategori × kualitas sumber (tier 1 = 1,0 · tier 2 = 0,8 · tier 4 = 0,7 · tier 3 = 0,5) × keaktifan (historis = 0,5), dibatasi 100. &lt;20 aman · 20–49 perlu perhatian · ≥50 berisiko. Verdict akhir tetap keputusan reviewer.</small>
      <div className="flex flex-wrap gap-1.5">{(Object.keys(VERDICT) as Verdict[]).map(v => <button key={v} className={`filter-chip inline-flex items-center gap-1.5 ${verdict === v ? 'active' : ''}`} onClick={() => setVerdict(v)}>{v === 'clear' ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}{VERDICT[v].label}</button>)}</div>
      <label>Ringkasan untuk laporan<textarea rows={4} value={summary} onChange={e => setSummary(e.target.value)} placeholder="Tulis ringkasan faktual: apa yang ditemukan, periode, dan sumber utama. Hindari label politik tanpa bukti." /></label>
      <div className="flex gap-2"><button className="state-btn !mt-0" onClick={save} disabled={saving}>{saving ? <Loader2 size={14} className="auth-spin" /> : <Check size={14} />}Simpan verdict</button></div>
    </div>
  </div>;
}

// ------------------------------------------------------------------ printable report
function ReportView({ c, accounts, cats, onClose }: { c: Case; accounts: CaseAccount[]; cats: Record<string, Category>; onClose: () => void }) {
  const [data, setData] = useState<{ handle: string; people: PersonLink[]; evidence: Evidence[] }[] | null>(null);
  useEffect(() => {
    (async () => {
      const out: { handle: string; people: PersonLink[]; evidence: Evidence[] }[] = [];
      for (const a of accounts) {
        const { data: links } = await supabase.from('person_accounts').select('role, title, source_url, persons(*)').eq('handle', a.handle);
        const people = ((links ?? []) as unknown as { role: Role; title: string | null; source_url: string | null; persons: Person }[]).map(l => ({ ...l.persons, role: l.role, title: l.title, source_url: l.source_url }));
        const { data: ev } = await supabase.from('bs_evidence').select('*').in('subject_key', [a.handle, ...people.map(p => p.id)]).order('evidence_date', { ascending: false, nullsFirst: false });
        out.push({ handle: a.handle, people, evidence: (ev ?? []) as Evidence[] });
      }
      setData(out);
    })();
  }, [accounts]);
  return <div className="bs-report-wrap">
    <div className="bs-report-bar"><span>Laporan Brand Safety · {c.client_name}</span><div className="flex gap-1.5"><button className="filter-chip inline-flex items-center gap-1.5" onClick={() => window.print()}><Printer size={13} />Cetak / PDF</button><button className="icon-btn" onClick={onClose} aria-label="Tutup"><X size={14} /></button></div></div>
    <article className="bs-report">
      <header>
        <p className="eyebrow">Brand Safety · Background Check</p>
        <h1>{c.title}</h1>
        <p>Disiapkan untuk <strong>{c.client_name}</strong> · {day(new Date().toISOString())} · cakupan {SCOPES[c.scope].label}</p>
        {c.definition && <p>Definisi afiliasi menurut klien: <em>{c.definition}</em></p>}
        <p className="small">Seluruh temuan berasal dari sumber publik dan disajikan sebagai bukti bertanggal dengan tautan. Skor adalah agregasi bukti (bobot kategori × kualitas sumber × keaktifan), bukan penilaian atas pandangan pribadi. Keputusan akhir ada pada klien.</p>
      </header>
      <table className="summary">
        <thead><tr><th>Akun</th><th>Followers</th><th>Bukti</th><th>Skor</th><th>Verdict</th></tr></thead>
        <tbody>{accounts.map(a => <tr key={a.handle}><td>{a.handle}</td><td>{fmt(a.followers)}</td><td>{a.evidence}</td><td>{a.score ?? '–'}</td><td>{a.verdict ? VERDICT[a.verdict].label : 'belum dinilai'}</td></tr>)}</tbody>
      </table>
      {!data ? <p>Memuat…</p> : data.map(d => {
        const a = accounts.find(x => x.handle === d.handle)!;
        return <section key={d.handle} className="acct">
          <h2>{d.handle} <span className={`v v-${a.verdict ?? 'none'}`}>{a.verdict ? VERDICT[a.verdict].label : 'belum dinilai'} · {a.score ?? scoreOf(d.evidence, cats).score}</span></h2>
          {a.summary && <p>{a.summary}</p>}
          {d.people.length > 0 && <><h3>Founder & manajemen</h3><ul>{d.people.map(p => <li key={p.id + p.role}><strong>{p.full_name}</strong> — {ROLES[p.role]}{p.title ? `, ${p.title}` : ''}{p.entity ? ` (${p.entity})` : ''}{p.source_url && <> · <a href={p.source_url}>sumber</a></>}</li>)}</ul></>}
          <h3>Bukti ({d.evidence.length})</h3>
          {d.evidence.length ? <table><thead><tr><th>Tanggal</th><th>Subjek</th><th>Kategori</th><th>Temuan</th><th>Sumber</th></tr></thead><tbody>{d.evidence.map(e => <tr key={e.id}><td>{day(e.evidence_date)}</td><td>{e.subject_type === 'account' ? e.subject_key : d.people.find(p => p.id === e.subject_key)?.full_name ?? '–'}</td><td>{cats[e.category]?.label ?? e.category}{!e.still_active && ' (historis)'}</td><td>{e.title}{e.detail && <><br /><span className="small">{e.detail}</span></>}</td><td>Tier {e.source_tier}{e.url && <><br /><a href={e.url}>{e.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 48)}</a></>}</td></tr>)}</tbody></table> : <p className="small">Tidak ditemukan bukti afiliasi dalam cakupan pemeriksaan.</p>}
        </section>;
      })}
      <footer className="small">Tier sumber: 1 dokumen resmi/pelantikan/KPU · 2 media arus utama dengan atribusi · 3 daftar/klaim pihak ketiga · 4 post subjek sendiri. Dibuat dengan Brand Monitor.</footer>
    </article>
  </div>;
}
