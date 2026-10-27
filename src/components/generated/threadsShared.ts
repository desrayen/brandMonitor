import { supabase } from '@/lib/supabase';

// ---------- types ----------
export type Topic = {
  id: string; name: string; keywords: string[]; exclude_keywords: string[]; search_sort: 'recent' | 'top';
  fetch_replies: boolean; max_items: number; interval_hours: number; active: boolean; last_run_at: string | null; created_at: string;
};
export type Post = {
  post_id: string; post_url: string | null; text: string | null; taken_at: string | null; username: string | null;
  is_reply: boolean; parent_post_id: string | null; root_post_id: string | null; reply_to_username: string | null; parent_inferred: boolean;
  like_count: number | null; reply_count: number | null; repost_count: number | null; quote_count: number | null; reshare_count: number | null; view_count: number | null;
  lang: string | null; first_seen_at: string | null; last_seen_at: string | null;
  sentiment_score: number | null; sentiment_reason: string | null; issue: string | null; relevant: boolean | null;
};
export type Row = Post & { keywords: string[]; excluded: boolean };
export type Account = { username: string; full_name: string | null; is_verified: boolean | null; follower_count: number | null; profile_pic_url: string | null };

export const POST_COLS = 'post_id,post_url,text,taken_at,username,is_reply,parent_post_id,root_post_id,reply_to_username,parent_inferred,like_count,reply_count,repost_count,quote_count,reshare_count,view_count,lang,first_seen_at,last_seen_at,sentiment_score,sentiment_reason,issue,relevant';

// ---------- formatting ----------
const WIB = 7 * 3600e3;
export const wibDay = (iso: string) => new Date(Date.parse(iso) + WIB).toISOString().slice(0, 10);
export const fmtTime = (iso: string | null) => iso ? new Date(Date.parse(iso) + WIB).toISOString().replace('T', ' ').slice(0, 16) + ' WIB' : '—';
export const ago = (iso: string | null) => {
  if (!iso) return 'never';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
export const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString('en-US');
export const compact = (n: number | null | undefined) => {
  const v = n ?? 0;
  return v >= 1e6 ? `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(v >= 1e4 ? 0 : 1)}K` : String(Math.round(v));
};

// ---------- sentiment ----------
export const SENT = { pos: '#4bde81', neu: '#2395ff', neg: '#f62c1e' } as const;
export type Polarity = 'pos' | 'neu' | 'neg';
export const polarity = (s: number | null | undefined): Polarity | null => s == null ? null : s > 0 ? 'pos' : s < 0 ? 'neg' : 'neu';
export const polarityLabel: Record<Polarity, string> = { pos: 'Positive', neu: 'Neutral', neg: 'Negative' };
/** colour for an average score in [-10, 10] */
export const scoreColor = (s: number | null | undefined) => s == null ? '#71717a' : s > 0.5 ? SENT.pos : s < -0.5 ? SENT.neg : SENT.neu;
export const signed = (n: number, digits = 0) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits)}`;
/** engagement a post received */
export const engagement = (r: Post) => (r.like_count ?? 0) + 2 * (r.reply_count ?? 0) + 3 * ((r.repost_count ?? 0) + (r.quote_count ?? 0));

// ---------- data loading ----------
export async function loadTopicRows(topicId: string): Promise<Row[]> {
  const map = new Map<string, Row>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('threads_post_topics').select(`keyword,excluded,threads_posts(${POST_COLS})`).eq('topic_id', topicId).range(from, from + 999);
    if (error) throw error;
    for (const l of (data ?? []) as unknown as { keyword: string; excluded: boolean; threads_posts: Post | null }[]) {
      const p = l.threads_posts as Post; if (!p) continue;
      const prev = map.get(p.post_id);
      const kw = l.keyword === '__reply__' ? [] : [l.keyword];
      map.set(p.post_id, prev ? { ...prev, keywords: [...new Set([...prev.keywords, ...kw])], excluded: prev.excluded && l.excluded } : { ...p, keywords: kw, excluded: l.excluded });
    }
    if (!data || data.length < 1000) break;
  }
  return [...map.values()];
}

export async function loadAccounts(): Promise<Map<string, Account>> {
  const map = new Map<string, Account>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('threads_accounts').select('username,full_name,is_verified,follower_count,profile_pic_url').range(from, from + 999);
    if (error) throw error;
    (data ?? []).forEach((a: Account) => map.set(a.username, a));
    if (!data || data.length < 1000) break;
  }
  return map;
}

// ---------- text terms (for "top terms by sentiment") ----------
const STOP = new Set(('yang dan di ini itu ga gak nggak enggak engga ngga aja saja banget bgt kalo kalau sama udah sudah tidak tdk buat untuk utk ada jadi lagi aku kamu gue gua gw lu lo loe kok deh sih dong nya mau bisa apa karena krn juga jg dari ke dengan dgn orang org kita kami mereka atau tapi tp pada akan masih harus lebih gimana bagaimana kenapa knp emang memang biar bikin terus trus sampai belum blm pernah semua banyak yg dg dr pd sm aja ya yaa yah ah eh oh wkwk wkwkwk haha hahaha the a an to of in is it and for on you i my me so this that are be was with just not no yes iya ini itu tuh nih kan pun lah kah toh deh si sang para pas mah apa siapa mana gitu gini begitu begini dia ia beliau aja jd jadi udh sdh ga gk g bkn bukan kayak kaya kek tau tahu emg mmg aku ku mu dll dsb lg klo kl sy saya anda kalian mereka nya.').split(/\s+/));
export function terms(text: string | null, n: 1 | 2 = 1): string[] {
  if (!text) return [];
  const words = text.toLowerCase().replace(/https?:\/\/\S+/g, ' ').replace(/@[\w.]+/g, ' ').replace(/[^a-z0-9#\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));
  if (n === 1) return [...new Set(words)];
  const out: string[] = [];
  for (let i = 0; i < words.length - 1; i++) out.push(`${words[i]} ${words[i + 1]}`);
  return [...new Set(out)];
}
