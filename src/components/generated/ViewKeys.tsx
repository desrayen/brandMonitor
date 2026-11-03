import { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, KeyRound, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { SHARE_PAGES, viewLink, type SharePage } from '@/lib/access';

type Key = {
  id: string; view_key: string; label: string | null; pages: SharePage[];
  created_at: string; last_used_at: string | null; expires_at: string | null; revoked: boolean;
};
type Draft = { id: string | null; label: string; pages: SharePage[]; expires: string; revoked: boolean };

const FN = `${(import.meta.env.NEXT_PUBLIC_SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')}/functions/v1/view-login`;
const KEY = import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
const when = (iso: string | null) => iso ? new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) : 'Never';
const pageLabel = (p: SharePage) => SHARE_PAGES.find(x => x.key === p)?.label ?? p;
const expired = (k: Key) => !!k.expires_at && new Date(k.expires_at) <= new Date();

export function ViewKeys() {
  const [rows, setRows] = useState<Key[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase.from('view_keys').select('id, view_key, label, pages, created_at, last_used_at, expires_at, revoked').order('created_at', { ascending: true });
    if (error) setError(error.message); else { setError(null); setRows(data as Key[]); }
  };
  useEffect(() => { load(); }, []);

  const copy = async (k: Key) => {
    await navigator.clipboard.writeText(viewLink(k.view_key)).catch(() => undefined);
    setCopied(k.id);
    setTimeout(() => setCopied(c => (c === k.id ? null : c)), 1600);
  };
  const remove = async (k: Key) => {
    if (!confirm(`Delete view key${k.label ? ` "${k.label}"` : ''}? Anyone using this link loses access right away.`)) return;
    setBusy(k.id);
    const { data } = await supabase.auth.getSession();
    const res = await fetch(FN, { method: 'POST', headers: { 'content-type': 'application/json', apikey: KEY, authorization: `Bearer ${data.session?.access_token ?? ''}` }, body: JSON.stringify({ action: 'delete', id: k.id }) });
    setBusy(null);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? 'Could not delete the key');
    load();
  };
  const startNew = () => setDraft({ id: null, label: '', pages: ['fyp'], expires: '', revoked: false });
  const startEdit = (k: Key) => setDraft({ id: k.id, label: k.label ?? '', pages: k.pages, expires: k.expires_at ? k.expires_at.slice(0, 10) : '', revoked: k.revoked });

  return <section className="threads-monitor">
    <div className="threads-filters">
      <h2 className="vk-title"><KeyRound size={16} />View Keys</h2>
      <div className="ml-auto"><button className="state-btn !mt-0 !h-8" onClick={startNew}><Plus size={14} />Add a new view key</button></div>
    </div>
    <p className="threads-meta">A view key gives read-only access to the pages you pick — no login needed. Send the link: <code>{window.location.origin}/login?view_key=…</code></p>
    {error && <p className="threads-meta !text-red-400">{error}</p>}
    {draft && <KeyForm draft={draft} setDraft={setDraft} onSaved={() => { setDraft(null); load(); }} />}

    <section className="panel mt-3">
      {rows === null ? <div className="flex justify-center py-10"><Loader2 size={18} className="auth-spin" /></div>
        : !rows.length ? <p className="m-0 py-10 text-center text-[13px] text-zinc-500">No view keys yet. Add one to share a page.</p>
        : <div className="table-scroll"><table className="vk-table">
          <thead><tr><th>#</th><th>Created</th><th>Last Used</th><th>View Key</th><th>Pages Enabled</th><th className="text-right">Actions</th></tr></thead>
          <tbody>{rows.map((k, i) => <tr key={k.id} className={k.revoked || expired(k) ? 'vk-off' : ''}>
            <td>{i + 1}</td>
            <td>{when(k.created_at)}</td>
            <td>{when(k.last_used_at)}</td>
            <td><code className="vk-key">{k.view_key}</code>{k.label && <div className="vk-label">{k.label}</div>}{k.revoked ? <span className="status-pill bad">revoked</span> : expired(k) ? <span className="status-pill warn">expired</span> : k.expires_at ? <span className="status-pill off">until {k.expires_at.slice(0, 10)}</span> : null}</td>
            <td><div className="vk-pages">{k.pages.map(p => <span key={p} className="status-pill on">{pageLabel(p)}</span>)}</div></td>
            <td><div className="topic-actions justify-end">
              <button className="icon-btn" onClick={() => startEdit(k)} aria-label="Edit" title="Edit"><Pencil size={14} /></button>
              <button className="icon-btn" onClick={() => copy(k)} aria-label="Copy link" title="Copy link">{copied === k.id ? <Check size={14} /> : <Copy size={14} />}</button>
              <a className="icon-btn" href={viewLink(k.view_key)} target="_blank" rel="noreferrer" aria-label="Open link" title="Open (use a private window to see the guest view)"><ExternalLink size={14} /></a>
              <button className="icon-btn danger" onClick={() => remove(k)} disabled={busy === k.id} aria-label="Delete" title="Delete">{busy === k.id ? <Loader2 size={14} className="auth-spin" /> : <Trash2 size={14} />}</button>
            </div></td>
          </tr>)}</tbody>
        </table></div>}
    </section>
  </section>;
}

function KeyForm({ draft, setDraft, onSaved }: { draft: Draft; setDraft: (d: Draft | null) => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const toggle = (p: SharePage) => set({ pages: draft.pages.includes(p) ? draft.pages.filter(x => x !== p) : [...draft.pages, p] });

  const save = async () => {
    if (!draft.pages.length) return setErr('Pick at least one page.');
    setErr(null); setSaving(true);
    const row = {
      label: draft.label.trim() || null,
      pages: SHARE_PAGES.map(p => p.key).filter(p => draft.pages.includes(p)),
      expires_at: draft.expires ? new Date(`${draft.expires}T23:59:59+07:00`).toISOString() : null,
      revoked: draft.revoked,
    };
    const { error } = draft.id ? await supabase.from('view_keys').update(row).eq('id', draft.id) : await supabase.from('view_keys').insert(row);
    setSaving(false);
    if (error) return setErr(error.message);
    onSaved();
  };

  return <div className="topic-form mt-3">
    <div className="flex items-center justify-between"><h3>{draft.id ? 'Edit view key' : 'New view key'}</h3><button className="icon-btn" onClick={() => setDraft(null)} aria-label="Close"><X size={14} /></button></div>
    <div className="grid gap-3 md:grid-cols-2">
      <label>Label (who is it for?)<input value={draft.label} onChange={e => set({ label: e.target.value })} placeholder="e.g. Tim Marketing Client A" autoFocus /></label>
      <label>Expires on (optional)<input type="date" value={draft.expires} onChange={e => set({ expires: e.target.value })} /></label>
    </div>
    <div>
      <small>Pages this link can open</small>
      <div className="vk-checks">{SHARE_PAGES.map(p => <label key={p.key} className={draft.pages.includes(p.key) ? 'vk-check on' : 'vk-check'}><input type="checkbox" checked={draft.pages.includes(p.key)} onChange={() => toggle(p.key)} />{p.label}</label>)}</div>
    </div>
    {draft.id && <label className="vk-check w-fit"><input type="checkbox" checked={draft.revoked} onChange={e => set({ revoked: e.target.checked })} />Revoked (link stops working, can be re-enabled)</label>}
    {err && <p className="m-0 text-[12px] text-red-400">{err}</p>}
    <div className="flex gap-2">
      <button className="state-btn !mt-0" onClick={save} disabled={saving}>{saving ? <Loader2 size={14} className="auth-spin" /> : null}{draft.id ? 'Save changes' : 'Create view key'}</button>
      <button className="filter-chip" onClick={() => setDraft(null)}>Cancel</button>
    </div>
  </div>;
}
