import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, Loader2, Pencil, Plus, Search, Trash2, UserRound, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useIsSuperAdmin } from './ThreadsMonitor';
import { AFF_STATUS, type AffStatus } from './BrandSafetyAffiliations';

// Brand Safety · "Tokoh" tab: person entity database. One row per public figure with the media accounts
// they are affiliated with (picked from the accounts already in the database), a summary + list of their
// Instagram content for the last 3 months, online news about them and a free-form manual note.

type Role = 'founder' | 'owner' | 'management' | 'commissioner' | 'advisor' | 'affiliated' | 'other';
type Tone = 'positive' | 'neutral' | 'negative';
type Media = { handle: string; role: Role; title: string | null; source_url: string | null; followers: number | null; status: AffStatus; content_flag: string };
type IgPost = { id: string; post_url: string; posted_at: string | null; caption: string | null; theme: string | null; views: number | null; note: string | null };
type News = { id: string; title: string; outlet: string | null; url: string | null; published_at: string | null; tone: Tone | null; summary: string | null };
type PersonRow = { id: string; full_name: string; position: string | null; entity: string | null; notes: string | null; ig_handle: string | null; x_handle: string | null; tiktok_handle: string | null; linkedin_url: string | null;
  ig_summary: string | null; ig_checked_at: string | null; news_checked_at: string | null; updated_at: string | null; media: Media[]; ig_from: string; ig_posts: IgPost[]; news: News[] };

const ROLE: Record<Role, string> = { founder: 'Founder', owner: 'Pemilik', management: 'Manajemen', commissioner: 'Komisaris', advisor: 'Penasihat', affiliated: 'Terafiliasi', other: 'Lainnya' };
const TONE: Record<Tone, { label: string; cls: string }> = { positive: { label: 'Positif', cls: 'on' }, neutral: { label: 'Netral', cls: 'off' }, negative: { label: 'Negatif', cls: 'bad' } };
const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString('en-US');
const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '–');
const normHandle = (h: string) => '@' + h.trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[/?#].*$/, '').replace(/^@+/, '').toLowerCase();
const inputCls = 'min-w-0 rounded-lg border border-[#3f3f46] bg-[#18181b] px-2.5 py-1.5 text-[13px] text-zinc-100 outline-none focus:border-[#ff743d]';

export function BrandSafetyPersons({ canEdit }: { canEdit: boolean }) {
  const isAdmin = useIsSuperAdmin();
  const [rows, setRows] = useState<PersonRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<PersonRow | 'new' | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [known, setKnown] = useState<string[]>([]);
  const load = useCallback(async () => {
    setError(null);
    const { data, error } = await supabase.rpc('bs_person_overview', { p_days: 92 });
    if (error) setError(error.message); else setRows(((data ?? []) as PersonRow[]).map(r => ({ ...r, media: r.media ?? [], ig_posts: r.ig_posts ?? [], news: r.news ?? [] })));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { supabase.from('accounts').select('handle').order('handle').then(({ data }) => setKnown(((data ?? []) as { handle: string }[]).map(r => r.handle))); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); }, [toast]);

  const shown = useMemo(() => {
    const ql = q.trim().toLowerCase().replace(/^@/, '');
    return (rows ?? []).filter(r => !ql || [r.full_name, r.position, r.entity, r.notes, r.ig_summary, ...r.media.map(m => m.handle + ' ' + (m.title ?? '')), ...r.news.map(n => n.title)].some(s => (s ?? '').toLowerCase().includes(ql)));
  }, [rows, q]);

  const remove = async (p: PersonRow) => {
    if (!confirm(`Hapus tokoh "${p.full_name}" beserta afiliasi media, konten IG, dan beritanya?`)) return;
    const { error } = await supabase.from('persons').delete().eq('id', p.id);
    if (error) setToast('Gagal: ' + error.message); else { setToast('Tokoh dihapus'); load(); }
  };

  if (error) return <p className="m-0 py-10 text-center text-[13px] text-red-400">{/bs_person_overview/.test(error) ? 'Fitur Tokoh belum aktif. Jalankan migration 20261106040000_bs_person_entity.sql di Supabase.' : error}</p>;
  if (!rows) return <div className="flex justify-center py-10"><Loader2 size={18} className="auth-spin" /></div>;
  return <>
    <div className="threads-filters">
      <p className="threads-meta !m-0"><UserRound size={14} />Database tokoh (person entity): afiliasi media dipilih dari akun yang sudah ada, konten IG 3 bulan terakhir, berita media online, dan catatan manual.{toast && <span className="!text-emerald-300"> · {toast}</span>}</p>
      <div className="threads-search ml-auto"><Search size={13} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari tokoh, akun, berita…" /></div>
      {canEdit && <button className="state-btn !mt-0 !h-8" onClick={() => setEditing('new')}><Plus size={14} />Tambah tokoh</button>}
    </div>
    {editing && <div className="mt-3"><PersonEditForm row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={msg => { setEditing(null); setToast(msg); load(); }} /></div>}
    <section className="panel mt-3 !p-0 overflow-hidden">
      <div className="table-scroll"><table>
        <thead><tr><th /><th>Nama tokoh</th><th>Afiliasi dengan media</th><th>Konten Instagram 3 bln terakhir</th><th>Berita media online</th><th>Note</th>{canEdit && <th />}</tr></thead>
        <tbody>{shown.map(p => {
          const isOpen = open === p.id;
          const latest = p.news[0];
          return <Fragment key={p.id}>
            <tr className="cursor-pointer" onClick={() => setOpen(isOpen ? null : p.id)}>
              <td className="!pr-0 text-zinc-500">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
              <td className="!whitespace-normal max-w-[260px]">
                <span className="block text-zinc-100 font-medium">{p.full_name}</span>
                {p.position && <span className="block text-[12px] text-zinc-400">{p.position}</span>}
                {p.entity && <span className="block text-[11.5px] text-zinc-500">{p.entity}</span>}
              </td>
              <td className="!whitespace-normal max-w-[300px]">
                <div className="flex flex-wrap gap-1">{p.media.length ? p.media.map(m => <span key={m.handle + m.role} className={`status-pill ${AFF_STATUS[m.status]?.cls ?? 'off'}`} title={`${ROLE[m.role]}${m.title ? ' · ' + m.title : ''} · afiliasi akun: ${AFF_STATUS[m.status]?.label ?? m.status}`}>{m.handle} · {ROLE[m.role]}</span>) : <span className="text-zinc-600">–</span>}</div>
              </td>
              <td className="!whitespace-normal max-w-[300px] text-[12px] text-zinc-400">
                {p.ig_summary ? (isOpen ? p.ig_summary : p.ig_summary.slice(0, 140) + (p.ig_summary.length > 140 ? '…' : '')) : <span className="text-zinc-600">belum dicek</span>}
                <span className="block text-[11px] text-zinc-500">{p.ig_posts.length} post tercatat{p.ig_checked_at ? ` · dicek ${day(p.ig_checked_at)}` : ''}</span>
              </td>
              <td className="!whitespace-normal max-w-[300px] text-[12px]">
                {latest ? <><a className="text-zinc-200 hover:underline" href={latest.url ?? undefined} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>{latest.title}</a><span className="block text-[11px] text-zinc-500">{latest.outlet ?? '–'} · {day(latest.published_at)}</span></> : <span className="text-zinc-600">belum ada</span>}
                <span className="block text-[11px] text-zinc-500">{p.news.length} berita{p.news_checked_at ? ` · dicek ${day(p.news_checked_at)}` : ''}</span>
              </td>
              <td className="!whitespace-normal max-w-[300px] text-[12px] text-zinc-400">{p.notes ? (isOpen ? p.notes : p.notes.slice(0, 120) + (p.notes.length > 120 ? '…' : '')) : '–'}</td>
              {canEdit && <td onClick={e => e.stopPropagation()}><div className="topic-actions justify-end"><button className="icon-btn" onClick={() => setEditing(p)} aria-label="Ubah"><Pencil size={13} /></button>{isAdmin && <button className="icon-btn danger" onClick={() => remove(p)} aria-label="Hapus"><Trash2 size={13} /></button>}</div></td>}
            </tr>
            {isOpen && <tr><td /><td colSpan={canEdit ? 6 : 5} className="!whitespace-normal bg-[#09090b]">
              <PersonDetail p={p} known={known} canEdit={canEdit} onChanged={load} onToast={setToast} />
            </td></tr>}
          </Fragment>;
        })}</tbody>
      </table></div>
      {!shown.length && <p className="m-0 py-10 text-center text-[13px] text-zinc-500">{rows.length ? 'Tidak ada tokoh yang cocok.' : 'Belum ada tokoh. Mulai dengan "Tambah tokoh".'}</p>}
    </section>
  </>;
}

// ------------------------------------------------------------------ expanded detail: media, IG posts, news
function PersonDetail({ p, known, canEdit, onChanged, onToast }: { p: PersonRow; known: string[]; canEdit: boolean; onChanged: () => void; onToast: (m: string) => void }) {
  return <div className="grid gap-5 py-3 lg:grid-cols-3">
    <MediaSection p={p} known={known} canEdit={canEdit} onChanged={onChanged} onToast={onToast} />
    <IgSection p={p} canEdit={canEdit} onChanged={onChanged} onToast={onToast} />
    <NewsSection p={p} canEdit={canEdit} onChanged={onChanged} onToast={onToast} />
  </div>;
}

const Heading = ({ children }: { children: React.ReactNode }) => <p className="m-0 pb-1 text-[11px] uppercase tracking-wide text-zinc-500">{children}</p>;

function MediaSection({ p, known, canEdit, onChanged, onToast }: { p: PersonRow; known: string[]; canEdit: boolean; onChanged: () => void; onToast: (m: string) => void }) {
  const [d, setD] = useState({ handle: '', role: 'affiliated' as Role, title: '', source_url: '' });
  const [err, setErr] = useState<string | null>(null);
  const add = async () => {
    const handle = normHandle(d.handle);
    if (!/^@[a-z0-9._]{1,30}$/.test(handle)) return setErr('Handle tidak valid.');
    if (!known.some(k => k.toLowerCase() === handle)) return setErr(`${handle} belum ada di database akun. Tambahkan dulu lewat tab Afiliasi (Import link).`);
    const { error } = await supabase.from('person_accounts').insert({ person_id: p.id, handle, role: d.role, title: d.title.trim() || null, source_url: d.source_url.trim() || null });
    if (error) return setErr(error.code === '23505' ? 'Sudah ditautkan dengan peran yang sama.' : error.message);
    setD({ handle: '', role: d.role, title: '', source_url: '' }); setErr(null); onToast('Afiliasi media ditambahkan'); onChanged();
  };
  const del = async (m: Media) => {
    if (!confirm(`Lepas ${m.handle} (${ROLE[m.role]}) dari ${p.full_name}?`)) return;
    const { error } = await supabase.from('person_accounts').delete().eq('person_id', p.id).eq('handle', m.handle).eq('role', m.role);
    if (error) onToast('Gagal: ' + error.message); else { onToast('Afiliasi dilepas'); onChanged(); }
  };
  return <div>
    <Heading>Afiliasi media ({p.media.length})</Heading>
    {p.media.length ? <ul className="m-0 list-none p-0 text-[12px] leading-relaxed">{p.media.map(m => <li key={m.handle + m.role} className="flex items-start gap-2 border-t border-[#27272a] py-1.5">
      <div className="min-w-0 flex-1">
        <a className="text-zinc-100 hover:underline" href={`https://www.instagram.com/${m.handle.slice(1)}/`} target="_blank" rel="noreferrer">{m.handle}</a>
        <span className="text-zinc-500"> · {ROLE[m.role]} · {fmt(m.followers)} followers</span>
        {m.title && <span className="block text-zinc-400">{m.title}</span>}
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5"><span className={`status-pill ${AFF_STATUS[m.status]?.cls ?? 'off'}`}>Afiliasi gov: {AFF_STATUS[m.status]?.label ?? m.status}</span>{m.source_url && <a className="inline-flex items-center gap-1 text-zinc-500 hover:underline" href={m.source_url} target="_blank" rel="noreferrer">sumber<ExternalLink size={10} /></a>}</span>
      </div>
      {canEdit && <button className="icon-btn !h-6 !w-6" onClick={() => del(m)} aria-label="Lepas"><X size={12} /></button>}
    </li>)}</ul> : <p className="m-0 text-[12px] text-zinc-500">Belum ada media yang ditautkan.</p>}
    {canEdit && <div className="mt-2 grid gap-1.5">
      <div className="flex gap-1.5">
        <input className={`${inputCls} flex-1`} list="bs-person-known" value={d.handle} onChange={e => setD({ ...d, handle: e.target.value })} placeholder="@akun media (dari database)" />
        <datalist id="bs-person-known">{known.map(k => <option key={k} value={k} />)}</datalist>
        <select className={inputCls} value={d.role} onChange={e => setD({ ...d, role: e.target.value as Role })}>{(Object.keys(ROLE) as Role[]).map(r => <option key={r} value={r}>{ROLE[r]}</option>)}</select>
      </div>
      <input className={inputCls} value={d.title} onChange={e => setD({ ...d, title: e.target.value })} placeholder="Keterangan peran (mis. Eks komisaris 2017)" />
      <div className="flex gap-1.5"><input className={`${inputCls} flex-1`} value={d.source_url} onChange={e => setD({ ...d, source_url: e.target.value })} placeholder="URL sumber (opsional)" /><button className="state-btn !mt-0 !h-8 !px-2.5" onClick={add} aria-label="Tambah afiliasi media"><Plus size={14} /></button></div>
      {err && <p className="m-0 text-[12px] text-red-400">{err}</p>}
    </div>}
  </div>;
}

function IgSection({ p, canEdit, onChanged, onToast }: { p: PersonRow; canEdit: boolean; onChanged: () => void; onToast: (m: string) => void }) {
  const [d, setD] = useState({ post_url: '', posted_at: '', theme: '', views: '', caption: '' });
  const [err, setErr] = useState<string | null>(null);
  const add = async () => {
    const url = d.post_url.trim();
    if (!/^https?:\/\//i.test(url)) return setErr('Link post wajib diisi (https://…).');
    const { error } = await supabase.from('person_ig_posts').insert({ person_id: p.id, post_url: url, posted_at: d.posted_at || null, theme: d.theme.trim() || null, views: d.views ? Number(d.views) : null, caption: d.caption.trim() || null });
    if (error) return setErr(error.code === '23505' ? 'Link post ini sudah tercatat.' : error.message);
    setD({ post_url: '', posted_at: '', theme: '', views: '', caption: '' }); setErr(null); onToast('Post IG ditambahkan'); onChanged();
  };
  const del = async (i: IgPost) => {
    if (!confirm('Hapus post ini dari daftar?')) return;
    const { error } = await supabase.from('person_ig_posts').delete().eq('id', i.id);
    if (error) onToast('Gagal: ' + error.message); else { onToast('Post dihapus'); onChanged(); }
  };
  return <div>
    <Heading>Konten Instagram · sejak {day(p.ig_from)} ({p.ig_posts.length})</Heading>
    {p.ig_handle ? <p className="m-0 pb-1 text-[12px]"><a className="inline-flex items-center gap-1 text-zinc-300 hover:underline" href={`https://www.instagram.com/${p.ig_handle.replace(/^@/, '')}/`} target="_blank" rel="noreferrer">{p.ig_handle}<ExternalLink size={10} /></a></p> : <p className="m-0 pb-1 text-[12px] text-zinc-600">Akun Instagram tokoh belum diisi.</p>}
    {p.ig_summary && <p className="m-0 mb-2 rounded border border-[#27272a] bg-[#111113] px-2 py-1.5 text-[12px] leading-relaxed text-zinc-300">{p.ig_summary}</p>}
    {p.ig_posts.length ? <ul className="m-0 list-none p-0 text-[12px] leading-relaxed">{p.ig_posts.map(i => <li key={i.id} className="flex items-start gap-2 border-t border-[#27272a] py-1.5">
      <div className="min-w-0 flex-1">
        <span className="text-zinc-500">{day(i.posted_at)}</span>{i.theme && <span className="status-pill off ml-1.5">{i.theme}</span>}{i.views != null && <span className="text-zinc-500"> · {fmt(i.views)} views</span>}
        <a className="mt-0.5 flex items-center gap-1 text-zinc-300 hover:underline" href={i.post_url} target="_blank" rel="noreferrer"><span className="min-w-0 truncate">{i.caption || i.post_url}</span><ExternalLink size={10} className="shrink-0" /></a>
      </div>
      {canEdit && <button className="icon-btn !h-6 !w-6" onClick={() => del(i)} aria-label="Hapus post"><X size={12} /></button>}
    </li>)}</ul> : <p className="m-0 text-[12px] text-zinc-500">Belum ada post dalam 3 bulan terakhir yang dicatat.</p>}
    {canEdit && <div className="mt-2 grid gap-1.5">
      <input className={inputCls} value={d.post_url} onChange={e => setD({ ...d, post_url: e.target.value })} placeholder="Link post / reel Instagram" />
      <div className="grid grid-cols-3 gap-1.5"><input className={inputCls} type="date" value={d.posted_at} onChange={e => setD({ ...d, posted_at: e.target.value })} /><input className={inputCls} value={d.theme} onChange={e => setD({ ...d, theme: e.target.value })} placeholder="Tema" /><input className={inputCls} type="number" min="0" value={d.views} onChange={e => setD({ ...d, views: e.target.value })} placeholder="Views" /></div>
      <div className="flex gap-1.5"><input className={`${inputCls} flex-1`} value={d.caption} onChange={e => setD({ ...d, caption: e.target.value })} placeholder="Ringkasan isi (opsional)" /><button className="state-btn !mt-0 !h-8 !px-2.5" onClick={add} aria-label="Tambah post"><Plus size={14} /></button></div>
      {err && <p className="m-0 text-[12px] text-red-400">{err}</p>}
    </div>}
  </div>;
}

function NewsSection({ p, canEdit, onChanged, onToast }: { p: PersonRow; canEdit: boolean; onChanged: () => void; onToast: (m: string) => void }) {
  const [d, setD] = useState({ title: '', outlet: '', url: '', published_at: '', tone: 'neutral' as Tone, summary: '' });
  const [err, setErr] = useState<string | null>(null);
  const add = async () => {
    if (!d.title.trim()) return setErr('Judul berita wajib diisi.');
    if (d.url.trim() && !/^https?:\/\//i.test(d.url.trim())) return setErr('URL harus diawali https://');
    const { error } = await supabase.from('person_news').insert({ person_id: p.id, title: d.title.trim(), outlet: d.outlet.trim() || null, url: d.url.trim() || null, published_at: d.published_at || null, tone: d.tone, summary: d.summary.trim() || null });
    if (error) return setErr(error.code === '23505' ? 'Berita dengan URL ini sudah tercatat.' : error.message);
    setD({ title: '', outlet: '', url: '', published_at: '', tone: 'neutral', summary: '' }); setErr(null); onToast('Berita ditambahkan'); onChanged();
  };
  const del = async (n: News) => {
    if (!confirm(`Hapus berita "${n.title}"?`)) return;
    const { error } = await supabase.from('person_news').delete().eq('id', n.id);
    if (error) onToast('Gagal: ' + error.message); else { onToast('Berita dihapus'); onChanged(); }
  };
  return <div>
    <Heading>Berita media online ({p.news.length})</Heading>
    {p.news.length ? <ul className="m-0 list-none p-0 text-[12px] leading-relaxed">{p.news.map(n => <li key={n.id} className="flex items-start gap-2 border-t border-[#27272a] py-1.5">
      <div className="min-w-0 flex-1">
        {n.url ? <a className="inline-flex items-start gap-1 text-zinc-100 hover:underline" href={n.url} target="_blank" rel="noreferrer">{n.title}<ExternalLink size={10} className="mt-1 shrink-0" /></a> : <span className="text-zinc-100">{n.title}</span>}
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-zinc-500">{n.outlet ?? '–'} · {day(n.published_at)}{n.tone && <span className={`status-pill ${TONE[n.tone].cls}`}>{TONE[n.tone].label}</span>}</span>
        {n.summary && <span className="block text-zinc-400">{n.summary}</span>}
      </div>
      {canEdit && <button className="icon-btn !h-6 !w-6" onClick={() => del(n)} aria-label="Hapus berita"><X size={12} /></button>}
    </li>)}</ul> : <p className="m-0 text-[12px] text-zinc-500">Belum ada berita yang dicatat.</p>}
    {canEdit && <div className="mt-2 grid gap-1.5">
      <input className={inputCls} value={d.title} onChange={e => setD({ ...d, title: e.target.value })} placeholder="Judul berita" />
      <div className="grid grid-cols-2 gap-1.5"><input className={inputCls} value={d.outlet} onChange={e => setD({ ...d, outlet: e.target.value })} placeholder="Media (mis. Kompas)" /><input className={inputCls} type="date" value={d.published_at} onChange={e => setD({ ...d, published_at: e.target.value })} /></div>
      <div className="flex gap-1.5"><input className={`${inputCls} flex-1`} value={d.url} onChange={e => setD({ ...d, url: e.target.value })} placeholder="URL berita" /><select className={inputCls} value={d.tone} onChange={e => setD({ ...d, tone: e.target.value as Tone })}>{(Object.keys(TONE) as Tone[]).map(t => <option key={t} value={t}>{TONE[t].label}</option>)}</select></div>
      <div className="flex gap-1.5"><input className={`${inputCls} flex-1`} value={d.summary} onChange={e => setD({ ...d, summary: e.target.value })} placeholder="Ringkasan (opsional)" /><button className="state-btn !mt-0 !h-8 !px-2.5" onClick={add} aria-label="Tambah berita"><Plus size={14} /></button></div>
      {err && <p className="m-0 text-[12px] text-red-400">{err}</p>}
    </div>}
  </div>;
}

// ------------------------------------------------------------------ add / edit person
function PersonEditForm({ row, onClose, onSaved }: { row: PersonRow | null; onClose: () => void; onSaved: (msg: string) => void }) {
  const [d, setD] = useState({
    full_name: row?.full_name ?? '', position: row?.position ?? '', entity: row?.entity ?? '', ig_handle: row?.ig_handle ?? '', x_handle: row?.x_handle ?? '', tiktok_handle: row?.tiktok_handle ?? '', linkedin_url: row?.linkedin_url ?? '',
    ig_summary: row?.ig_summary ?? '', ig_checked_at: row?.ig_checked_at ?? '', news_checked_at: row?.news_checked_at ?? '', notes: row?.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<typeof d>) => setD({ ...d, ...p });
  const save = async () => {
    if (!d.full_name.trim()) return setErr('Nama tokoh wajib diisi.');
    setSaving(true); setErr(null);
    const nz = (s: string) => s.trim() || null;
    const rec = { full_name: d.full_name.trim(), position: nz(d.position), entity: nz(d.entity), ig_handle: d.ig_handle.trim() ? normHandle(d.ig_handle) : null, x_handle: nz(d.x_handle), tiktok_handle: nz(d.tiktok_handle), linkedin_url: nz(d.linkedin_url),
      ig_summary: nz(d.ig_summary), ig_checked_at: d.ig_checked_at || null, news_checked_at: d.news_checked_at || null, notes: nz(d.notes), updated_at: new Date().toISOString() };
    const { error } = row ? await supabase.from('persons').update(rec).eq('id', row.id) : await supabase.from('persons').insert(rec);
    setSaving(false);
    if (error) return setErr(error.code === '23505' ? 'Tokoh dengan nama ini sudah ada.' : error.message);
    onSaved(row ? 'Tersimpan' : 'Tokoh ditambahkan');
  };
  return <div className="topic-form">
    <div className="flex items-center justify-between"><h3>{row ? `Ubah ${row.full_name}` : 'Tambah tokoh'}</h3><button className="icon-btn" onClick={onClose} aria-label="Tutup"><X size={14} /></button></div>
    <div className="grid gap-3 md:grid-cols-3">
      <label>Nama tokoh<input value={d.full_name} onChange={e => set({ full_name: e.target.value })} autoFocus /></label>
      <label>Jabatan / peran<input value={d.position} onChange={e => set({ position: e.target.value })} placeholder="mis. Mantan anggota DPR RI" /></label>
      <label>Badan usaha / grup<input value={d.entity} onChange={e => set({ entity: e.target.value })} placeholder="mis. CT Corp" /></label>
      <label>Instagram<input value={d.ig_handle} onChange={e => set({ ig_handle: e.target.value })} placeholder="@…" /></label>
      <label>X / Twitter<input value={d.x_handle} onChange={e => set({ x_handle: e.target.value })} placeholder="@…" /></label>
      <label>TikTok<input value={d.tiktok_handle} onChange={e => set({ tiktok_handle: e.target.value })} placeholder="@…" /></label>
    </div>
    <label>LinkedIn URL<input value={d.linkedin_url} onChange={e => set({ linkedin_url: e.target.value })} placeholder="https://www.linkedin.com/in/…" /></label>
    <label>Ringkasan konten Instagram 3 bulan terakhir<textarea rows={3} value={d.ig_summary} onChange={e => set({ ig_summary: e.target.value })} placeholder="Tema utama, frekuensi, apakah ada konten pemerintahan/sponsor. Faktual, sertakan periode." /></label>
    <div className="grid gap-3 md:grid-cols-2">
      <label>Konten IG terakhir dicek<input type="date" value={d.ig_checked_at} onChange={e => set({ ig_checked_at: e.target.value })} /></label>
      <label>Berita terakhir dicek<input type="date" value={d.news_checked_at} onChange={e => set({ news_checked_at: e.target.value })} /></label>
    </div>
    <label>Note (catatan manual)<textarea rows={3} value={d.notes} onChange={e => set({ notes: e.target.value })} /></label>
    <small>Hanya informasi publik. Afiliasi media, post IG, dan berita ditambahkan dari baris tokoh setelah disimpan (klik barisnya).</small>
    {err && <p className="m-0 text-[12px] text-red-400">{err}</p>}
    <div className="flex gap-2"><button className="state-btn !mt-0" onClick={save} disabled={saving}>{saving && <Loader2 size={14} className="auth-spin" />}Simpan</button><button className="filter-chip" onClick={onClose}>Batal</button></div>
  </div>;
}
