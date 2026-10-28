import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Download, Loader2, Pencil, Plus, Search, Star, Trash2, Users, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useIsSuperAdmin } from './ThreadsMonitor';

// Manage which Instagram accounts are monitored (homeless media = `accounts`, KOL = `kol_accounts`).
// The daily scrape reads these tables, so changes here apply from the next update run.
type Kind = 'hm' | 'kol';
type Acc = { handle: string; followers: number; region: string | null; category: string | null; created_at: string | null; posts: number; last_post: string | null };
type SortKey = 'handle' | 'followers' | 'posts' | 'last_post' | 'category';
type Draft = { original: string | null; handle: string; followers: string; region: string; category: string };

const KINDS: Record<Kind, { label: string; table: 'accounts' | 'kol_accounts'; icon: React.ReactNode }> = {
  hm: { label: 'Homeless Media', table: 'accounts', icon: <Users size={14} /> },
  kol: { label: 'KOL', table: 'kol_accounts', icon: <Star size={14} /> },
};
const DEFAULT_CATEGORY = 'Beauty, Health, & Wellness';
const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString('en-US');
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' }) : '–');
const normHandle = (h: string) => '@' + h.trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[/?#].*$/, '').replace(/^@+/, '').toLowerCase();
const parseFollowers = (s: string) => {
  const m = s.trim().toLowerCase().replace(/,/g, '').match(/^(\d+(?:\.\d+)?)\s*([kmb]|rb|jt)?$/);
  if (!m) return NaN;
  const mult = { k: 1e3, rb: 1e3, m: 1e6, jt: 1e6, b: 1e9 }[m[2] as 'k'] ?? 1;
  return Math.round(parseFloat(m[1]) * mult);
};

export function AccountManager() {
  const isAdmin = useIsSuperAdmin();
  const [kind, setKind] = useState<Kind>('hm');
  const [rows, setRows] = useState<Acc[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('followers');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(null); setError(null);
    const { data, error } = await supabase.rpc('monitored_accounts', { p_kind: kind });
    if (error) setError(error.message); else setRows((data ?? []) as Acc[]);
  }, [kind]);
  useEffect(() => { load(); setDraft(null); setQ(''); }, [load]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); }, [toast]);

  const categories = useMemo(() => [...new Set((rows ?? []).map(r => r.category).filter(Boolean) as string[])].sort(), [rows]);
  const shown = useMemo(() => {
    const ql = q.trim().toLowerCase().replace(/^@/, '');
    const list = (rows ?? []).filter(r => !ql || r.handle.toLowerCase().includes(ql) || (r.category ?? '').toLowerCase().includes(ql));
    return list.sort((a, b) => {
      const l = a[sortKey], r = b[sortKey];
      const res = typeof l === 'number' && typeof r === 'number' ? l - r : String(l ?? '').localeCompare(String(r ?? ''));
      return dir === 'asc' ? res : -res;
    });
  }, [rows, q, sortKey, dir]);
  const totals = useMemo(() => ({ accounts: rows?.length ?? 0, posts: (rows ?? []).reduce((s, r) => s + Number(r.posts), 0), empty: (rows ?? []).filter(r => !Number(r.posts)).length }), [rows]);

  const sortBy = (k: SortKey) => { if (sortKey === k) setDir(dir === 'asc' ? 'desc' : 'asc'); else { setSortKey(k); setDir(k === 'handle' || k === 'category' ? 'asc' : 'desc'); } };
  const startNew = () => setDraft({ original: null, handle: '', followers: '', region: 'ID', category: DEFAULT_CATEGORY });
  const startEdit = (r: Acc) => setDraft({ original: r.handle, handle: r.handle, followers: String(r.followers), region: r.region ?? 'ID', category: r.category ?? DEFAULT_CATEGORY });

  const remove = async (r: Acc) => {
    if (!confirm(`Delete ${r.handle} and its ${fmt(r.posts)} stored posts?\n\nThis can't be undone. The account will no longer be monitored.`)) return;
    const { data, error } = await supabase.rpc('delete_monitored_account', { p_kind: kind, p_handle: r.handle });
    if (error) { alert(error.message); return; }
    setToast(`Deleted ${r.handle} (${fmt((data as { posts: number })?.posts)} posts)`);
    load();
  };

  const exportCsv = () => {
    const head = ['handle', 'followers', 'region', ...(kind === 'kol' ? ['category'] : []), 'posts', 'last_post'];
    const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = [head.join(','), ...shown.map(r => [r.handle, r.followers, r.region, ...(kind === 'kol' ? [r.category] : []), r.posts, r.last_post?.slice(0, 10)].map(esc).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `${kind === 'hm' ? 'homeless-media' : 'kol'}-accounts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  };

  const cols: [SortKey, string][] = [['handle', 'Account'], ['followers', 'Followers'], ...(kind === 'kol' ? [['category', 'Category'] as [SortKey, string]] : []), ['posts', 'Posts stored'], ['last_post', 'Last post']];
  const pill = (on: boolean) => `tab-pill ${on ? 'active' : ''}`;

  return <section className="threads-monitor">
    <div className="threads-filters">
      <nav className="tab-nav" aria-label="Account type">{(Object.keys(KINDS) as Kind[]).map(k => <button key={k} className={pill(kind === k)} onClick={() => setKind(k)}>{KINDS[k].icon}<span>{KINDS[k].label}</span></button>)}</nav>
      <div className="threads-search"><Search size={13} /><input value={q} onChange={e => setQ(e.target.value)} placeholder={kind === 'kol' ? 'Search @account or category' : 'Search @account'} /></div>
      <div className="ml-auto flex gap-1.5">
        <button className="filter-chip inline-flex items-center gap-1.5" onClick={exportCsv} disabled={!shown.length}><Download size={13} />Export CSV</button>
        {isAdmin && <button className="state-btn !mt-0 !h-8" onClick={startNew}><Plus size={14} />Add account</button>}
      </div>
    </div>
    <p className="threads-meta"><span className="live-dot" />{fmt(totals.accounts)} {KINDS[kind].label} accounts monitored · {fmt(totals.posts)} posts stored{totals.empty ? ` · ${totals.empty} without posts yet` : ''} · changes apply from the next daily update{!isAdmin && ' · view only (super admin can edit)'}</p>
    {toast && <p className="threads-meta !text-emerald-300">{toast}</p>}

    {draft && isAdmin && <div className="mt-3"><AccountForm kind={kind} draft={draft} setDraft={setDraft} categories={categories} existing={rows ?? []} onSaved={msg => { setDraft(null); setToast(msg); load(); }} /></div>}

    <section className="panel mt-3">
      {error ? <p className="m-0 py-10 text-center text-[13px] text-red-400">Couldn't load accounts: {error}</p>
        : rows === null ? <div className="flex justify-center py-10"><Loader2 size={18} className="auth-spin" /></div>
        : !shown.length ? <p className="m-0 py-10 text-center text-[13px] text-zinc-500">{rows.length ? 'No account matches your search.' : 'No accounts yet.'}</p>
        : <div className="table-scroll"><table>
          <thead><tr>{cols.map(([k, label]) => <th key={k}><button className={sortKey === k ? 'active-sort' : ''} onClick={() => sortBy(k)}>{label}{sortKey === k && (dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}</button></th>)}<th>Region</th>{isAdmin && <th />}</tr></thead>
          <tbody>{shown.map(r => <tr key={r.handle}>
            <td><span className="account-avatar">{r.handle.replace('@', '').slice(0, 1).toUpperCase()}</span><a href={`https://www.instagram.com/${r.handle.replace(/^@/, '')}/`} target="_blank" rel="noreferrer" className="hover:underline">{r.handle}</a></td>
            <td>{fmt(r.followers)}</td>
            {kind === 'kol' && <td>{r.category ?? '–'}</td>}
            <td>{Number(r.posts) ? fmt(r.posts) : <span className="status-pill off">none yet</span>}</td>
            <td>{day(r.last_post)}</td>
            <td>{r.region ?? '–'}</td>
            {isAdmin && <td><div className="topic-actions justify-end">
              <button className="icon-btn" onClick={() => startEdit(r)} aria-label={`Edit ${r.handle}`}><Pencil size={14} /></button>
              <button className="icon-btn danger" onClick={() => remove(r)} aria-label={`Delete ${r.handle}`}><Trash2 size={14} /></button>
            </div></td>}
          </tr>)}</tbody>
        </table></div>}
    </section>
  </section>;
}

function AccountForm({ kind, draft, setDraft, categories, existing, onSaved }: {
  kind: Kind; draft: Draft; setDraft: (d: Draft | null) => void; categories: string[]; existing: Acc[]; onSaved: (msg: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isNew = draft.original === null;
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });

  const save = async () => {
    setErr(null);
    const handle = normHandle(draft.handle);
    const followers = parseFollowers(draft.followers);
    if (!/^@[a-z0-9._]{1,30}$/.test(handle)) return setErr('Enter a valid Instagram handle, e.g. @kumparancom');
    if (!Number.isFinite(followers) || followers < 0) return setErr('Followers must be a number, e.g. 125000, 125k or 1.2m');
    if (handle !== draft.original && existing.some(r => r.handle === handle)) return setErr(`${handle} is already in the list`);
    const row: Record<string, unknown> = { handle, followers, region: draft.region.trim() || 'ID' };
    if (kind === 'kol') row.category = draft.category.trim() || DEFAULT_CATEGORY;
    setSaving(true);
    const table = KINDS[kind].table;
    const { error } = isNew ? await supabase.from(table).insert(row) : await supabase.from(table).update(row).eq('handle', draft.original!);
    setSaving(false);
    if (error) return setErr(error.message);
    onSaved(isNew ? `Added ${handle} — it will be scraped in the next daily update` : `Saved ${handle}${handle !== draft.original ? ` (renamed from ${draft.original}, posts moved too)` : ''}`);
  };

  return <div className="topic-form">
    <div className="flex items-center justify-between"><h3>{isNew ? `Add ${KINDS[kind].label} account` : `Edit ${draft.original}`}</h3><button className="icon-btn" onClick={() => setDraft(null)} aria-label="Close"><X size={14} /></button></div>
    <div className="grid gap-3 md:grid-cols-4">
      <label>Instagram handle<input value={draft.handle} onChange={e => set({ handle: e.target.value })} placeholder="@account or instagram.com/account" autoFocus /></label>
      <label>Followers<input value={draft.followers} onChange={e => set({ followers: e.target.value })} placeholder="e.g. 125000 or 1.2m" inputMode="decimal" /></label>
      <label>Region<input value={draft.region} onChange={e => set({ region: e.target.value })} placeholder="ID" /></label>
      {kind === 'kol' && <label>Category<input value={draft.category} onChange={e => set({ category: e.target.value })} list="kol-categories" /><datalist id="kol-categories">{categories.map(c => <option key={c} value={c} />)}</datalist></label>}
    </div>
    {!isNew && <small>Renaming the handle keeps all stored posts — they move to the new handle automatically.</small>}
    {err && <p className="m-0 text-[12px] text-red-400">{err}</p>}
    <div className="flex gap-2">
      <button className="state-btn !mt-0" onClick={save} disabled={saving}>{saving ? <Loader2 size={14} className="auth-spin" /> : null}{isNew ? 'Add account' : 'Save changes'}</button>
      <button className="filter-chip" onClick={() => setDraft(null)}>Cancel</button>
    </div>
  </div>;
}
