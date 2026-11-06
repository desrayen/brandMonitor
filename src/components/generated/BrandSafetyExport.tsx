import { useState } from 'react';
import { Download, Loader2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { buildXlsx, downloadBlob, type Cell } from '@/lib/xlsx';
import type { AffRow } from './BrandSafetyAffiliations';

// Brand Safety · "Import link & Export Excel": paste Instagram links / handles → every account is looked up
// (unknown ones are added to the database as "Belum diriset") → one .xlsx with the full Brand Safety data.

const HANDLE_RE = /^@?[A-Za-z0-9._]{1,30}$/;
const RESERVED = new Set(['p', 'reel', 'reels', 'tv', 'stories', 'explore', 'accounts', 'direct', 's', 'about', 'legal', 'directory', 'web', 'developer']);
const POST_KINDS = new Set(['p', 'reel', 'reels', 'tv']);

export type Parsed = { handles: { handle: string; input: string }[]; shortcodes: { code: string; input: string }[]; invalid: { input: string; reason: string }[] };

export function parseInstagramInput(text: string): Parsed {
  const out: Parsed = { handles: [], shortcodes: [], invalid: [] };
  const seenH = new Set<string>(); const seenS = new Set<string>();
  const pushH = (h: string, input: string) => { const k = '@' + h.replace(/^@/, '').toLowerCase(); if (!seenH.has(k)) { seenH.add(k); out.handles.push({ handle: k, input }); } };
  for (const raw of text.split(/[\s,;]+/)) {
    const tok = raw.trim().replace(/^[<(["']+|[>)\]"'.,;]+$/g, '');
    if (!tok) continue;
    if (/instagram\.com|instagr\.am/i.test(tok)) {
      let path = '';
      try { path = new URL(/^https?:\/\//i.test(tok) ? tok : 'https://' + tok).pathname; } catch { out.invalid.push({ input: raw, reason: 'URL tidak valid' }); continue; }
      const seg = path.split('/').filter(Boolean);
      if (!seg.length) { out.invalid.push({ input: raw, reason: 'Link tanpa username' }); continue; }
      const first = seg[0].toLowerCase();
      if (POST_KINDS.has(first)) {
        const code = seg[1];
        if (code && /^[A-Za-z0-9_-]{5,}$/.test(code)) { if (!seenS.has(code)) { seenS.add(code); out.shortcodes.push({ code, input: tok }); } }
        else out.invalid.push({ input: raw, reason: 'Link post tanpa kode' });
        continue;
      }
      if (RESERVED.has(first)) { out.invalid.push({ input: raw, reason: 'Bukan link profil' }); continue; }
      if (!HANDLE_RE.test(seg[0])) { out.invalid.push({ input: raw, reason: 'Username tidak valid' }); continue; }
      pushH(seg[0], tok);
      continue;
    }
    if (tok.startsWith('@') && HANDLE_RE.test(tok)) { pushH(tok, tok); continue; }
    out.invalid.push({ input: raw, reason: 'Bukan link Instagram (username harus diawali @)' });
  }
  return out;
}

const d10 = (s?: string | null) => (s ? String(s).slice(0, 10) : '');
const stamp = () => { const n = new Date(); const p = (x: number) => String(x).padStart(2, '0'); return `${n.getFullYear()}${p(n.getMonth() + 1)}${p(n.getDate())}-${p(n.getHours())}${p(n.getMinutes())}`; };

export function BrandSafetyExport({ statusLabel, flagLabel, onClose, onDone }: {
  statusLabel: (s: string) => string; flagLabel: (s: string) => string; onClose: () => void; onDone: (msg: string) => void;
}) {
  const [text, setText] = useState('');
  const [add, setAdd] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const parsedPreview = text.trim() ? parseInstagramInput(text) : null;

  const run = async () => {
    setErr(null);
    const p = parseInstagramInput(text);
    if (!p.handles.length && !p.shortcodes.length) return setErr('Tidak ada link/username Instagram yang valid. Tempel satu link atau @username per baris.');
    setBusy(true);
    try {
      const inputOf = new Map<string, string[]>();
      const addInput = (h: string, i: string) => inputOf.set(h, [...(inputOf.get(h) ?? []), i]);
      const order: string[] = [];
      const pushOrder = (h: string) => { if (!order.includes(h)) order.push(h); };
      for (const x of p.handles) { pushOrder(x.handle); addInput(x.handle, x.input); }
      const invalid = [...p.invalid];
      if (p.shortcodes.length) {
        const { data, error } = await supabase.from('ig_posts').select('shortcode,account_handle').in('shortcode', p.shortcodes.map(s => s.code));
        if (error) throw new Error(error.message);
        const map = new Map((data ?? []).map((r: { shortcode: string; account_handle: string }) => [r.shortcode, r.account_handle]));
        for (const s of p.shortcodes) {
          const h = map.get(s.code);
          if (h) { const k = '@' + h.replace(/^@/, '').toLowerCase(); pushOrder(k); addInput(k, s.input); }
          else invalid.push({ input: s.input, reason: 'Link post: akunnya tidak ditemukan di database (kirim link profil)' });
        }
      }
      if (!order.length) throw new Error('Tidak ada akun yang bisa diproses dari link post tersebut.');
      const { data, error } = await supabase.rpc('bs_import_handles', { p_handles: order, p_add: add });
      if (error) throw new Error(error.message);
      const res = data as { added: string[]; not_added: string[]; rows: AffRow[] };
      const byHandle = new Map(res.rows.map(r => [r.handle.toLowerCase(), r]));
      const added = new Set(res.added.map(h => h.toLowerCase()));
      const notAdded = new Set(res.not_added.map(h => h.toLowerCase()));
      const found = order.map(h => byHandle.get(h)).filter(Boolean) as AffRow[];
      for (const h of order) if (!byHandle.has(h)) invalid.push({ input: h, reason: notAdded.has(h) ? 'Tidak ditambahkan (akun dikecualikan atau tidak punya izin menambah akun)' : 'Tidak ditemukan' });

      const ig = (h: string) => `https://www.instagram.com/${h.replace(/^@/, '')}/`;
      const main: Cell[][] = [['No', 'Akun', 'Followers', 'Grup', 'Badan usaha / founder', 'Probable Affiliated with Gov', 'Probable Status', 'Detail', 'Jumlah referensi', 'Referensi', 'Konten 3 bln', 'Periode konten', 'Post terpantau', 'Post sponsor gov/BUMN', 'Post liputan gov', 'Alasan konten', 'Catatan review konten', 'Tanggal riset', 'Tanggal cek konten', 'Catatan sistem', 'Input asal']];
      found.forEach((r, i) => {
        const note = added.has(r.handle.toLowerCase()) ? 'Akun baru ditambahkan ke database - belum diriset' : r.status === 'unknown' ? 'Belum diriset' : '';
        main.push([i + 1, { v: r.handle, link: ig(r.handle) }, r.followers || null, r.group_name, r.entity, r.affiliated_name, statusLabel(r.status), r.detail, r.links.length, r.links.map((l, k) => `${k + 1}. ${l.title || l.url}${l.source ? ' - ' + l.source : ''}${l.date ? ' (' + d10(l.date) + ')' : ''}\n${l.url}`).join('\n'),
          flagLabel(r.content_flag), r.content_window_from ? `${d10(r.content_window_from)} s/d ${d10(r.content_window_to)}` : '', r.content_posts, r.content_paid_posts, r.content_topic_posts, r.content_reason, r.content_note, d10(r.researched_at), d10(r.content_checked_at), note, (inputOf.get(r.handle.toLowerCase()) ?? []).join('\n')]);
      });
      const refs: Cell[][] = [['Akun', 'No', 'Judul', 'Sumber', 'Tanggal', 'URL']];
      const posts: Cell[][] = [['Akun', 'Tipe', 'Tanggal', 'Brand sponsor', 'Caption', 'Views', 'URL']];
      for (const r of found) {
        r.links.forEach((l, k) => refs.push([{ v: r.handle, link: ig(r.handle) }, k + 1, l.title, l.source, d10(l.date), { v: l.url, link: l.url }]));
        for (const e of r.content_examples) posts.push([{ v: r.handle, link: ig(r.handle) }, e.type === 'paid' ? 'Sponsor gov/BUMN' : e.type === 'mention' ? 'Mention' : 'Liputan', d10(e.date), e.brand ?? '', e.caption ?? '', e.views ?? null, { v: e.url, link: e.url }]);
      }
      const cnt = (s: string) => found.filter(r => r.status === s).length;
      const info: Cell[][] = [['Brand Safety - Export Excel', ''],
        ['Dibuat', new Date().toLocaleString('id-ID')],
        ['Akun diproses', found.length],
        ['Akun baru ditambahkan', res.added.length],
        ['Input tidak valid / dilewati', invalid.length],
        ['High / Medium / Low', `${cnt('high')} / ${cnt('medium')} / ${cnt('low')}`],
        ['Tidak ditemukan / Belum diriset', `${cnt('none')} / ${cnt('unknown')}`],
        ['', ''],
        ['Legenda status', 'High = sangat jelas, termasuk investasi langsung/tidak langsung atau jabatan/kepemilikan tercatat. Medium = afiliasi jelas & bersumber, tanpa bukti investasi. Low = kemungkinan hubungan keluarga/jaringan, belum ada bukti langsung. Tidak ditemukan = sudah diriset, tidak ada afiliasi. Belum diriset = belum ada riset.'],
        ['Legenda konten', 'Konten dipindai dari post terpantau (ig_posts) dalam periode yang tertera: sponsor instansi pemerintah/BUMN vs liputan editorial. Liputan editorial bukan indikator afiliasi.'],
        ['', '']];
      if (invalid.length) { info.push(['Input dilewati', 'Alasan']); for (const x of invalid) info.push([x.input, x.reason]); }

      const blob = buildXlsx([
        { name: 'Brand Safety', rows: main, widths: [5, 22, 12, 24, 30, 36, 14, 60, 10, 70, 22, 24, 10, 12, 10, 50, 40, 12, 12, 26, 34] },
        { name: 'Referensi', rows: refs, widths: [22, 5, 60, 22, 12, 70] },
        { name: 'Contoh post', rows: posts, widths: [22, 18, 12, 20, 70, 12, 50] },
        { name: 'Info', rows: info, widths: [34, 110], header: false },
      ]);
      downloadBlob(blob, `brand-safety-export-${stamp()}.xlsx`);
      onDone(`Excel diunduh: ${found.length} akun${res.added.length ? `, ${res.added.length} akun baru ditambahkan` : ''}${invalid.length ? `, ${invalid.length} input dilewati` : ''}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const pv = parsedPreview;
  return <div className="topic-form">
    <div className="flex items-center justify-between"><h3>Import link Instagram &amp; Export Excel</h3><button className="icon-btn" onClick={onClose} aria-label="Tutup"><X size={14} /></button></div>
    <label>Tempel link profil Instagram atau @username — satu per baris (boleh dicampur, juga link post/reel yang akunnya sudah ada di database)
      <textarea rows={8} value={text} onChange={e => setText(e.target.value)} spellCheck={false} placeholder={'https://www.instagram.com/folkative/\nhttps://instagram.com/kumparancom?igsh=…\n@jktinfo'} />
    </label>
    <label className="flex items-center gap-2 !flex-row text-[12px] text-zinc-300"><input type="checkbox" checked={add} onChange={e => setAdd(e.target.checked)} style={{ width: 'auto' }} />Tambahkan akun yang belum ada ke database (status “Belum diriset”, followers terisi saat scrape berikutnya)</label>
    {pv && <p className="m-0 text-[12px] text-zinc-400">Terbaca: <b>{pv.handles.length}</b> akun{pv.shortcodes.length ? `, ${pv.shortcodes.length} link post` : ''}{pv.invalid.length ? <span className="text-amber-300"> · {pv.invalid.length} dilewati ({pv.invalid.slice(0, 3).map(x => x.reason).join('; ')}{pv.invalid.length > 3 ? '…' : ''})</span> : null}</p>}
    {err && <p className="m-0 text-[12px] text-red-400">{err}</p>}
    <div className="flex gap-2"><button className="state-btn !mt-0" onClick={run} disabled={busy || !text.trim()}>{busy ? <Loader2 size={14} className="auth-spin" /> : <Download size={14} />}Proses &amp; download .xlsx</button><button className="filter-chip" onClick={onClose}>Batal</button></div>
  </div>;
}
