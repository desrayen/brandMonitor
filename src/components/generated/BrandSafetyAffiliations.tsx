import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, FileSpreadsheet, Loader2, Pencil, RefreshCw, Search, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { BrandSafetyExport } from './BrandSafetyExport';

// Brand Safety · "Afiliasi" tab: one row per monitored account with the probable
// government affiliation (name), its strength (low / medium / high), a sourced
// explanation and at least five credible links where the trail can be read.

export type AffStatus = 'unknown' | 'none' | 'low' | 'medium' | 'high';
type Link = { url: string; title?: string; source?: string; date?: string };
export type ContentFlag = 'no_data' | 'none' | 'editorial' | 'paid';
type Example = { shortcode: string; url: string; date: string; type: 'paid' | 'mention' | 'topic'; brand?: string | null; offer?: string | null; caption?: string; views?: number | null };
export type AffRow = Row;
type Row = { handle: string; followers: number | null; region: string | null; entity: string | null; group_name: string | null; affiliated_name: string | null; status: AffStatus; detail: string | null; links: Link[]; researched_at: string | null; updated_at: string | null;
  content_flag: ContentFlag; content_posts: number; content_paid_posts: number; content_topic_posts: number; content_window_from: string | null; content_window_to: string | null; content_reason: string | null; content_note: string | null; content_examples: Example[]; content_checked_at: string | null };

export const CONTENT_FLAG: Record<ContentFlag, { label: string; cls: string; help: string }> = {
  paid: { label: 'Konten berbayar gov/BUMN', cls: 'bad', help: 'Ada post bersponsor instansi pemerintah atau BUMN dalam periode.' },
  editorial: { label: 'Liputan gov', cls: 'warn', help: 'Ada post yang membahas pejabat/instansi/program pemerintah (editorial, tanpa sponsor). Lihat catatan nada.' },
  none: { label: 'Bersih', cls: 'on', help: 'Tidak ada post yang menyebut pemerintah atau bersponsor pemerintah/BUMN dalam periode.' },
  no_data: { label: 'Belum ada data', cls: 'off', help: 'Scraper belum menangkap post akun ini dalam periode — perlu backfill histori.' },
};

export const AFF_STATUS: Record<AffStatus, { label: string; cls: string; help: string }> = {
  high: { label: 'High', cls: 'bad', help: 'Sangat jelas — termasuk investasi langsung maupun tidak langsung, atau jabatan/kepemilikan tercatat.' },
  medium: { label: 'Medium', cls: 'warn', help: 'Afiliasi jelas dan bersumber (jabatan, kampanye resmi, kontrak/kerja sama), tanpa bukti investasi.' },
  low: { label: 'Low', cls: 'run', help: 'Kemungkinan hubungan keluarga/jaringan/asosiasi; belum ada bukti langsung.' },
  none: { label: 'Tidak ditemukan', cls: 'on', help: 'Sudah diriset, tidak ditemukan afiliasi maupun badan usaha yang terkait.' },
  unknown: { label: 'Belum diriset', cls: 'off', help: 'Belum ada riset.' },
};
const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString('en-US');
const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '–');
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

export function BrandSafetyAffiliations({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<AffStatus | 'all' | 'found'>('all');
  const [cflag, setCflag] = useState<ContentFlag | 'all' | 'flagged'>('all');
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const load = useCallback(async () => {
    setError(null);
    const { data, error } = await supabase.rpc('bs_affiliation_overview');
    if (error) setError(error.message); else setRows(((data ?? []) as Row[]).map(r => ({ ...r, content_flag: r.content_flag ?? 'no_data', content_examples: r.content_examples ?? [] })));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); }, [toast]);
  const refreshContent = async () => {
    setRefreshing(true);
    const { data, error } = await supabase.rpc('bs_refresh_content_flags', { p_days: 92 });
    setRefreshing(false);
    if (error) return setToast('Gagal: ' + error.message);
    setToast(`Konten dicek ulang (${(data as { updated?: number })?.updated ?? 0} akun)`); load();
  };

  const shown = useMemo(() => {
    const ql = q.trim().toLowerCase().replace(/^@/, '');
    return (rows ?? []).filter(r => (status === 'all' || (status === 'found' ? ['low', 'medium', 'high'].includes(r.status) : r.status === status))
      && (cflag === 'all' || (cflag === 'flagged' ? ['paid', 'editorial'].includes(r.content_flag) : r.content_flag === cflag))
      && (!ql || r.handle.toLowerCase().includes(ql) || (r.affiliated_name ?? '').toLowerCase().includes(ql) || (r.group_name ?? '').toLowerCase().includes(ql) || (r.entity ?? '').toLowerCase().includes(ql) || (r.content_reason ?? '').toLowerCase().includes(ql)));
  }, [rows, q, status, cflag]);
  const counts = useMemo(() => { const c: Record<string, number> = {}; for (const r of rows ?? []) c[r.status] = (c[r.status] ?? 0) + 1; return c; }, [rows]);
  const ccounts = useMemo(() => { const c: Record<string, number> = {}; for (const r of rows ?? []) c[r.content_flag] = (c[r.content_flag] ?? 0) + 1; return c; }, [rows]);
  const period = useMemo(() => { const r = (rows ?? []).find(x => x.content_window_from); return r ? `${day(r.content_window_from)} – ${day(r.content_window_to)}` : null; }, [rows]);

  if (error) return <p className="m-0 py-10 text-center text-[13px] text-red-400">{/bs_affiliation/.test(error) ? 'Tabel afiliasi belum ada. Jalankan migration 20261106010000_bs_affiliations.sql di Supabase.' : error}</p>;
  if (!rows) return <div className="flex justify-center py-10"><Loader2 size={18} className="auth-spin" /></div>;
  return <>
    <div className="threads-filters">
      <nav className="tab-nav" aria-label="Status">
        <button className={status === 'all' ? 'tab-pill active' : 'tab-pill'} onClick={() => setStatus('all')}>Semua ({rows.length})</button>
        <button className={status === 'found' ? 'tab-pill active' : 'tab-pill'} onClick={() => setStatus('found')}>Ada afiliasi ({(counts.low ?? 0) + (counts.medium ?? 0) + (counts.high ?? 0)})</button>
        {(['high', 'medium', 'low', 'none', 'unknown'] as AffStatus[]).map(s => <button key={s} className={status === s ? 'tab-pill active' : 'tab-pill'} onClick={() => setStatus(s)} title={AFF_STATUS[s].help}>{AFF_STATUS[s].label} ({counts[s] ?? 0})</button>)}
      </nav>
      <div className="threads-search"><Search size={13} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari akun, nama, grup, alasan…" /></div>
    </div>
    <div className="threads-filters">
      <nav className="tab-nav" aria-label="Konten">
        <span className="text-[11px] uppercase tracking-wide text-zinc-500 self-center mr-1">Konten</span>
        <button className={cflag === 'all' ? 'tab-pill active' : 'tab-pill'} onClick={() => setCflag('all')}>Semua</button>
        <button className={cflag === 'flagged' ? 'tab-pill active' : 'tab-pill'} onClick={() => setCflag('flagged')}>Ada sinyal gov ({(ccounts.paid ?? 0) + (ccounts.editorial ?? 0)})</button>
        {(['paid', 'editorial', 'none', 'no_data'] as ContentFlag[]).map(s => <button key={s} className={cflag === s ? 'tab-pill active' : 'tab-pill'} onClick={() => setCflag(s)} title={CONTENT_FLAG[s].help}>{CONTENT_FLAG[s].label} ({ccounts[s] ?? 0})</button>)}
      </nav>
      <button className="filter-chip" onClick={() => setExporting(v => !v)} title="Tempel daftar link Instagram, unduh 1 file Excel berisi data Brand Safety-nya"><FileSpreadsheet size={12} /> Import link &amp; Export Excel</button>
      {canEdit && <button className="filter-chip" onClick={refreshContent} disabled={refreshing} title="Hitung ulang sinyal konten 3 bulan terakhir dari ig_posts">{refreshing ? <Loader2 size={12} className="auth-spin" /> : <RefreshCw size={12} />} Cek ulang konten</button>}
    </div>
    <p className="threads-meta"><span className="live-dot" />Low = kemungkinan hubungan keluarga/jaringan · Medium = afiliasi jelas & bersumber · High = sangat jelas, termasuk investasi langsung/tidak langsung. Setiap baris berisi minimal 5 tautan kredibel. Kolom <b>Konten</b> memindai post 3 bulan terakhir{period ? ` (${period})` : ''}: sponsor instansi pemerintah/BUMN vs liputan editorial.{toast && <span className="!text-emerald-300"> · {toast}</span>}</p>
    {exporting && <div className="mt-3"><BrandSafetyExport statusLabel={s => AFF_STATUS[s as AffStatus]?.label ?? s} flagLabel={s => CONTENT_FLAG[s as ContentFlag]?.label ?? s} onClose={() => setExporting(false)} onDone={msg => { setToast(msg); load(); }} /></div>}
    {editing && <div className="mt-3"><AffForm row={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setToast('Tersimpan'); load(); }} /></div>}
    <section className="panel mt-3 !p-0 overflow-hidden">
      <div className="table-scroll"><table>
        <thead><tr><th /><th>Akun</th><th>Followers</th><th>Grup / badan usaha</th><th>Probable Affiliated with Gov</th><th>Probable Status</th><th>Detail</th><th>Referensi</th><th>Konten 3 bln</th><th>Alasan konten</th>{canEdit && <th />}</tr></thead>
        <tbody>{shown.map(r => {
          const isOpen = open === r.handle;
          return <Fragment key={r.handle}>
            <tr className="cursor-pointer" onClick={() => setOpen(isOpen ? null : r.handle)}>
              <td className="!pr-0 text-zinc-500">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
              <td><span className="account-avatar">{r.handle.slice(1, 2).toUpperCase()}</span><a href={`https://www.instagram.com/${r.handle.slice(1)}/`} target="_blank" rel="noreferrer" className="hover:underline" onClick={e => e.stopPropagation()}>{r.handle}</a></td>
              <td>{fmt(r.followers)}</td>
              <td className="!whitespace-normal max-w-[220px] text-[12px]">{r.group_name && <span className="block text-zinc-100">{r.group_name}</span>}<span className="text-zinc-500">{r.entity ?? (r.status === 'none' ? 'tidak ditemukan badan usaha' : '–')}</span></td>
              <td className="!whitespace-normal max-w-[220px]">{r.affiliated_name ?? <span className="text-zinc-600">–</span>}</td>
              <td><span className={`status-pill ${AFF_STATUS[r.status].cls}`}>{AFF_STATUS[r.status].label}</span></td>
              <td className="!whitespace-normal max-w-[420px] text-[12px] text-zinc-400">{r.detail ? (isOpen ? r.detail : r.detail.slice(0, 140) + (r.detail.length > 140 ? '…' : '')) : '–'}</td>
              <td>{r.links.length ? <span className={`status-pill ${r.links.length >= 5 ? 'off' : 'warn'}`}>{r.links.length} tautan</span> : '–'}</td>
              <td title={CONTENT_FLAG[r.content_flag].help}><span className={`status-pill ${CONTENT_FLAG[r.content_flag].cls}`}>{CONTENT_FLAG[r.content_flag].label}</span>{r.content_posts > 0 && <span className="block mt-1 text-[11px] text-zinc-500">{r.content_paid_posts > 0 ? `${r.content_paid_posts} sponsor · ` : ''}{r.content_topic_posts > 0 ? `${r.content_topic_posts} liputan · ` : ''}{r.content_posts} post</span>}</td>
              <td className="!whitespace-normal max-w-[380px] text-[12px] text-zinc-400">{r.content_reason ? (isOpen ? r.content_reason : r.content_reason.slice(0, 120) + (r.content_reason.length > 120 ? '…' : '')) : '–'}{r.content_note && !isOpen && <span className="block text-[11px] text-amber-300/80">catatan review ✓</span>}</td>
              {canEdit && <td onClick={e => e.stopPropagation()}><button className="icon-btn" onClick={() => setEditing(r)} aria-label="Ubah"><Pencil size={13} /></button></td>}
            </tr>
            {isOpen && <tr><td /><td colSpan={canEdit ? 10 : 9} className="!whitespace-normal bg-[#09090b]">
              <div className="grid gap-4 py-2 lg:grid-cols-2">
                <div>
                  <p className="m-0 pb-1 text-[11px] uppercase tracking-wide text-zinc-500">Referensi afiliasi</p>
                  {r.links.length ? <ol className="m-0 pl-5 text-[12px] leading-relaxed">{r.links.map((l, i) => <li key={i}><a className="inline-flex items-center gap-1 text-zinc-200 hover:underline" href={l.url} target="_blank" rel="noreferrer">{l.title || l.url}<ExternalLink size={11} /></a><span className="text-zinc-500"> — {l.source || host(l.url)}{l.date ? ` · ${day(l.date)}` : ''}</span></li>)}</ol> : <p className="m-0 text-[12px] text-zinc-500">Belum ada referensi.</p>}
                  {r.researched_at && <p className="m-0 pt-2 text-[11px] text-zinc-600">Diriset {day(r.researched_at)}{r.updated_at ? ` · diperbarui ${day(r.updated_at)}` : ''}</p>}
                </div>
                <div>
                  <p className="m-0 pb-1 text-[11px] uppercase tracking-wide text-zinc-500">Konten terkait pemerintah ({r.content_window_from ? `${day(r.content_window_from)} – ${day(r.content_window_to)}` : '3 bulan'})</p>
                  {r.content_note && <p className="m-0 mb-2 rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-[12px] leading-relaxed text-amber-100/90">{r.content_note}</p>}
                  {r.content_examples.length ? <ul className="m-0 list-none p-0 text-[12px] leading-relaxed">{r.content_examples.map(e => <li key={e.shortcode} className="flex gap-2 py-0.5"><span className={`status-pill shrink-0 ${e.type === 'paid' ? 'bad' : 'warn'}`}>{e.type === 'paid' ? `Sponsor${e.brand ? ': ' + e.brand : ''}` : 'Liputan'}</span><span className="text-zinc-500 shrink-0">{day(e.date)}</span><a className="inline-flex items-center gap-1 text-zinc-300 hover:underline" href={e.url} target="_blank" rel="noreferrer">{e.caption || e.shortcode}<ExternalLink size={11} /></a></li>)}</ul>
                    : <p className="m-0 text-[12px] text-zinc-500">{r.content_flag === 'no_data' ? 'Belum ada post tertangkap dalam periode ini.' : 'Tidak ada post yang menyinggung pemerintah/BUMN.'}</p>}
                  {r.content_checked_at && <p className="m-0 pt-2 text-[11px] text-zinc-600">Dicek {day(r.content_checked_at)} · otomatis dari ig_posts + review manual</p>}
                </div>
              </div>
            </td></tr>}
          </Fragment>;
        })}</tbody>
      </table></div>
      {!shown.length && <p className="m-0 py-10 text-center text-[13px] text-zinc-500">Tidak ada akun yang cocok.</p>}
    </section>
  </>;
}

function AffForm({ row, onClose, onSaved }: { row: Row; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState({ entity: row.entity ?? '', group_name: row.group_name ?? '', affiliated_name: row.affiliated_name ?? '', status: (row.status === 'unknown' ? 'none' : row.status) as Exclude<AffStatus, 'unknown'>, detail: row.detail ?? '', content_note: row.content_note ?? '', links: row.links.map(l => [l.url, l.title, l.source, l.date].filter(Boolean).join(' | ')).join('\n') });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<typeof d>) => setD({ ...d, ...p });
  const parseLinks = (): Link[] => d.links.split('\n').map(s => s.trim()).filter(Boolean).map(line => { const [url, title, source, date] = line.split('|').map(x => x.trim()); return { url, title: title || undefined, source: source || undefined, date: date || undefined }; });
  const save = async () => {
    const links = parseLinks();
    if (links.some(l => !/^https?:\/\//.test(l.url))) return setErr('Setiap baris referensi harus diawali URL (https://…).');
    if (['low', 'medium', 'high'].includes(d.status) && links.length < 5) return setErr('Status Low/Medium/High butuh minimal 5 tautan kredibel.');
    if (['low', 'medium', 'high'].includes(d.status) && !d.affiliated_name.trim()) return setErr('Isi nama orang/lembaga yang terafiliasi.');
    setSaving(true); setErr(null);
    const { error } = await supabase.from('bs_affiliations').upsert({ handle: row.handle, entity: d.entity.trim() || null, group_name: d.group_name.trim() || null, affiliated_name: d.affiliated_name.trim() || null, status: d.status, detail: d.detail.trim() || null, content_note: d.content_note.trim() || null, links, researched_at: new Date().toISOString().slice(0, 10) });
    setSaving(false);
    if (error) return setErr(error.message);
    onSaved();
  };
  return <div className="topic-form">
    <div className="flex items-center justify-between"><h3>Afiliasi {row.handle}</h3><button className="icon-btn" onClick={onClose} aria-label="Tutup"><X size={14} /></button></div>
    <div className="grid gap-3 md:grid-cols-3">
      <label>Grup<input value={d.group_name} onChange={e => set({ group_name: e.target.value })} placeholder="mis. FOLK Group" /></label>
      <label>Badan usaha<input value={d.entity} onChange={e => set({ entity: e.target.value })} placeholder="mis. PT Multi Garam Utama Tbk (FOLK)" /></label>
      <label>Probable Status<select value={d.status} onChange={e => set({ status: e.target.value as Exclude<AffStatus, 'unknown'> })}>{(['none', 'low', 'medium', 'high'] as const).map(s => <option key={s} value={s}>{AFF_STATUS[s].label} — {AFF_STATUS[s].help}</option>)}</select></label>
    </div>
    <label>Probable Affiliated with Gov (nama orang / lembaga)<input value={d.affiliated_name} onChange={e => set({ affiliated_name: e.target.value })} placeholder="mis. Rahayu Saraswati Djojohadikusumo (keponakan Presiden; Komut TRIN/TRUE)" /></label>
    <label>Detail (fakta bersumber, bukan kesimpulan)<textarea rows={4} value={d.detail} onChange={e => set({ detail: e.target.value })} /></label>
    <label>Catatan review konten (nada liputan, konteks sponsor — ditampilkan di kolom Konten; angka & contoh post dihitung otomatis)<textarea rows={3} value={d.content_note} onChange={e => set({ content_note: e.target.value })} placeholder="mis. Sponsor BRI = iklan komersial BUMN; liputan bernada kritis (MBG, ijazah Gibran)." /></label>
    <label>Referensi — satu per baris: URL | judul | sumber | tanggal (YYYY-MM-DD)<textarea rows={6} value={d.links} onChange={e => set({ links: e.target.value })} placeholder={'https://www.cnbcindonesia.com/... | FOLK Group rampungkan investasi ke Folkative | CNBC Indonesia | 2023-09-06'} spellCheck={false} /></label>
    {err && <p className="m-0 text-[12px] text-red-400">{err}</p>}
    <div className="flex gap-2"><button className="state-btn !mt-0" onClick={save} disabled={saving}>{saving && <Loader2 size={14} className="auth-spin" />}Simpan</button><button className="filter-chip" onClick={onClose}>Batal</button></div>
  </div>;
}
