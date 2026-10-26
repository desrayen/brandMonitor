import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type ContentTypeName = 'Reel' | 'Carousel' | 'Single Image';

export type IgPost = {
  id: string;
  capture_date: string;
  post_url: string | null;
  shortcode: string | null;
  account_handle: string;
  content_type: ContentTypeName;
  post_category: 'Organic Post' | 'Sponsored Post';
  caption: string | null;
  collab_accounts: string | null;
  published_at: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  reposts: number | null;
  er_by_followers: number | null;
  likes_hidden: boolean | null;
  viral_category: string | null;
  primary_trigger: string | null;
  share_driver: string | null;
  brand_name: string | null;
  product_name: string | null;
  product_type: string | null;
};

export type IgAccount = { handle: string; followers: number };

export type Filters = {
  dates: string[];
  brands: string[];
  type: 'All' | ContentTypeName;
  category: 'All' | 'Organic' | 'Sponsored';
};

const POST_COLUMNS = 'id,capture_date,post_url,shortcode,account_handle,content_type,post_category,caption,collab_accounts,published_at,views,likes,comments,reposts,er_by_followers,likes_hidden,viral_category,primary_trigger,share_driver,brand_name,product_name,product_type';

async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  const pageSize = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + pageSize - 1);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < pageSize) break;
  }
  return out;
}

export type RawData = { posts: IgPost[]; accounts: IgAccount[] };

export type DataSource = 'hm' | 'kol';

// Each dashboard dataset lives in its own pair of tables.
export const SOURCES: Record<DataSource, { label: string; short: string; posts: string; accounts: string; footer: string }> = {
  hm: { label: 'Homeless Media', short: 'HM', posts: 'ig_posts', accounts: 'accounts', footer: 'Data IG (HM)' },
  kol: { label: 'KOL', short: 'KOL', posts: 'kol_posts', accounts: 'kol_accounts', footer: 'Data IG (KOL · Beauty, Health & Wellness)' },
};

export function useIgData(source: DataSource = 'hm') {
  const [data, setData] = useState<RawData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setError(null);
    setData(null);
    const src = SOURCES[source];
    Promise.all([fetchAll<IgPost>(src.posts, POST_COLUMNS), fetchAll<IgAccount>(src.accounts, 'handle,followers')])
      .then(([posts, accounts]) => { if (!cancelled) setData({ posts, accounts }); })
      .catch(e => { if (!cancelled) setError(e?.message ?? String(e)); });
    return () => { cancelled = true; };
  }, [reloadKey, source]);
  return { data, error, reload: () => setReloadKey(k => k + 1) };
}

// ---------- helpers ----------
const WIB_MS = 7 * 3600 * 1000;
const wibDate = (iso: string) => new Date(Date.parse(iso) + WIB_MS).toISOString().slice(0, 10);
const wibHour = (iso: string) => new Date(Date.parse(iso) + WIB_MS).getUTCHours();
const handle = (h: string) => h.replace(/^@/, '');
const avg = (xs: (number | null | undefined)[]) => { const v = xs.filter((x): x is number => typeof x === 'number' && !Number.isNaN(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; };
const median = (xs: (number | null | undefined)[]) => { const v = xs.filter((x): x is number => typeof x === 'number').sort((a, b) => a - b); if (!v.length) return 0; const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
const sum = (xs: (number | null | undefined)[]) => xs.reduce<number>((a, b) => a + (typeof b === 'number' ? b : 0), 0);
const r2 = (n: number) => Math.round(n * 100) / 100;
const mode = (xs: (string | null | undefined)[]) => { const c = new Map<string, number>(); xs.forEach(x => { if (x) c.set(x, (c.get(x) ?? 0) + 1); }); return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'; };
export const compact = (n: number) => n >= 1e6 ? `${r2(n / 1e6).toString().replace(/\.0+$/, '')}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n);
const fmtNum = (n: number) => Math.round(n).toLocaleString('en-US');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dateLabel = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
const ratio = (a: number, b: number) => (b > 0 ? (a / b).toFixed(1) : '—');

const PALETTE = ['#a855f7', '#22d3ee', '#818cf8', '#f97316', '#14b8a6', '#fb7185', '#facc15', '#a3e635'];

function groupBy<T>(rows: T[], key: (r: T) => string | null | undefined) {
  const m = new Map<string, T[]>();
  rows.forEach(r => { const k = key(r); if (!k) return; const arr = m.get(k); if (arr) arr.push(r); else m.set(k, [r]); });
  return m;
}

function perf(rows: IgPost[]) {
  return { posts: rows.length, likes: Math.round(avg(rows.map(r => r.likes))), er: r2(avg(rows.map(r => r.er_by_followers))) };
}

// ---------- the dashboard model ----------
export function buildDashboard(raw: RawData, f: Filters) {
  const followers = new Map(raw.accounts.map(a => [a.handle, Number(a.followers)]));
  const all = raw.posts;
  const dateOptions = [...new Set(all.map(p => wibDate(p.published_at)))].sort().map(key => ({ key, label: dateLabel(key) }));
  const brandOptions = [...new Set(all.map(p => p.brand_name).filter((b): b is string => !!b))].sort((a, b) => a.localeCompare(b)).map(name => ({ name }));

  const posts = all.filter(p =>
    (f.dates.length === 0 || f.dates.includes(wibDate(p.published_at))) &&
    (f.type === 'All' || p.content_type === f.type) &&
    (f.category === 'All' || (f.category === 'Sponsored') === (p.post_category === 'Sponsored Post')) &&
    (f.brands.length === 0 || (!!p.brand_name && f.brands.includes(p.brand_name))));

  const reels = posts.filter(p => p.content_type === 'Reel');
  const kpis = {
    posts: posts.length,
    likes: sum(posts.map(p => p.likes)),
    comments: sum(posts.map(p => p.comments)),
    reposts: sum(posts.map(p => p.reposts)),
    reelViews: sum(reels.map(p => p.views)),
    reels: reels.length,
    avgER: r2(avg(posts.map(p => p.er_by_followers))),
    medianER: r2(median(posts.map(p => p.er_by_followers))),
  };

  const contentData = (['Reel', 'Carousel', 'Single Image'] as ContentTypeName[]).map(name => {
    const rows = posts.filter(p => p.content_type === name);
    return { name, ...perf(rows), ...(name === 'Reel' ? { views: Math.round(avg(rows.map(r => r.views))) } : {}) };
  });

  const ranked = (key: (p: IgPost) => string | null, limit = 10) => [...groupBy(posts, key).entries()]
    .map(([name, rows]) => ({ name, ...perf(rows) })).sort((a, b) => b.posts - a.posts).slice(0, limit);
  const categoryData = ranked(p => p.viral_category);
  const triggerData = ranked(p => p.primary_trigger);
  const shareData = [...groupBy(posts, p => p.share_driver).entries()].map(([name, rows]) => ({ name, value: rows.length })).sort((a, b) => b.value - a.value);

  const hourData = Array.from({ length: 24 }, () => 0);
  posts.forEach(p => { hourData[wibHour(p.published_at)]++; });

  const accountRows = [...groupBy(posts, p => p.account_handle).entries()].map(([h, rows]) => ({
    account: handle(h), posts: rows.length, followersValue: followers.get(h) ?? 0, followers: compact(followers.get(h) ?? 0),
    likes: Math.round(avg(rows.map(r => r.likes))), er: r2(avg(rows.map(r => r.er_by_followers))),
  })).sort((a, b) => b.posts - a.posts);

  const topPosts = [...posts].filter(p => p.likes != null).sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0)).slice(0, 10).map((p, i) => ({
    rank: i + 1, account: handle(p.account_handle), type: p.content_type, category: p.viral_category ?? '—',
    likes: p.likes ?? 0, comments: p.comments ?? 0, er: r2(p.er_by_followers ?? 0), caption: p.caption ?? '', url: p.post_url,
  }));

  const organic = posts.filter(p => p.post_category === 'Organic Post');
  const sponsored = posts.filter(p => p.post_category === 'Sponsored Post');
  const stats = (rows: IgPost[]) => ({ posts: rows.length, likes: Math.round(avg(rows.map(r => r.likes))), er: r2(avg(rows.map(r => r.er_by_followers))), views: Math.round(avg(rows.filter(r => r.content_type === 'Reel').map(r => r.views))) });
  const organicStats = stats(organic);
  const sponsoredStats = stats(sponsored);

  // ----- brand analytics (sponsored posts with an attributed brand) -----
  const branded = posts.filter(p => p.brand_name);
  const brandGroups = [...groupBy(branded, p => p.brand_name).entries()];
  const reachOf = (rows: IgPost[]) => sum([...new Set(rows.map(r => r.account_handle))].map(h => followers.get(h) ?? 0));
  const brandPerformanceData = brandGroups.map(([brandName, rows]) => {
    const reachValue = reachOf(rows);
    const erValue = avg(rows.map(r => r.er_by_followers));
    const likesValue = avg(rows.map(r => r.likes));
    const hasEr = rows.some(r => r.er_by_followers != null);
    return {
      brandName, productService: mode(rows.map(r => r.product_name)), category: mode(rows.map(r => r.product_type)), posts: rows.length,
      accountsUsed: [...new Set(rows.map(r => r.account_handle))].join(', '),
      reach: `~${compact(reachValue)}`, reachValue,
      avgER: hasEr ? `${r2(erValue)}%` : 'hidden', avgERValue: hasEr ? erValue : -1,
      avgLikes: hasEr ? fmtNum(likesValue) : 'hidden', avgLikesValue: hasEr ? likesValue : -1,
      contentType: mode(rows.map(r => r.content_type)),
    };
  });

  const byCategory = [...groupBy(brandGroups.map(([, rows]) => rows[0]), p => p.product_type ?? 'Other').entries()].map(([name, rows]) => ({ name, count: rows.length })).sort((a, b) => b.count - a.count);
  const topCats = byCategory.slice(0, 7);
  const otherCount = sum(byCategory.slice(7).map(c => c.count));
  const brandCategoryBreakdown = [...topCats, ...(otherCount ? [{ name: 'Other', count: otherCount }] : [])].map((c, i) => ({ ...c, color: PALETTE[i % PALETTE.length] }));

  const multiAccountCampaigns = brandGroups.filter(([, rows]) => new Set(rows.map(r => r.account_handle)).size >= 2)
    .map(([brandName, rows], i) => ({
      brandName, product: mode(rows.map(r => r.product_name)),
      accounts: [...new Set(rows.map(r => r.account_handle))].map(h => ({ handle: h })),
      reachValue: reachOf(rows), reach: `~${compact(reachOf(rows))} reach`, posts: rows.length, accent: PALETTE[i % PALETTE.length], note: undefined as string | undefined,
    })).sort((a, b) => b.reachValue - a.reachValue).slice(0, 6);

  const topBrandReachData = [...brandPerformanceData].sort((a, b) => b.reachValue - a.reachValue).slice(0, 8).map((b, i) => ({
    brandName: b.brandName, category: b.category, posts: b.posts, accounts: b.accountsUsed, reach: b.reach,
    reachValue: r2(b.reachValue / 1e6), product: b.productService, color: PALETTE[i % PALETTE.length],
  }));

  const brandAccounts = [...groupBy(sponsored, p => p.account_handle).entries()].map(([h, rows]) => {
    const names = [...new Set(rows.map(r => r.brand_name).filter((b): b is string => !!b))];
    return {
      account: handle(h), followersValue: followers.get(h) ?? 0, followers: compact(followers.get(h) ?? 0), sponsoredPosts: rows.length,
      productType: mode(rows.map(r => r.product_type)),
      brandNames: names.length > 8 ? `${names.slice(0, 8).join(', ')} + ${names.length - 8} more` : names.join(', ') || '—',
    };
  }).sort((a, b) => b.sponsoredPosts - a.sponsoredPosts);

  // ----- generated insights -----
  const insights: [string, string][] = [];
  const reel = contentData[0];
  const nonReelLikes = avg(contentData.slice(1).filter(c => c.posts).map(c => c.likes));
  if (reel.posts && reel.likes) insights.push(['📊', `Carousel & single images earn ~${ratio(nonReelLikes, reel.likes)}× the avg likes of Reels`]);
  if (organicStats.posts && sponsoredStats.posts) insights.push(['🌱', `Organic posts get ${ratio(organicStats.er, sponsoredStats.er)}× the engagement rate of sponsored posts`]);
  const trigByEr = [...triggerData].filter(t => t.posts >= 5).sort((a, b) => b.er - a.er);
  if (trigByEr.length && triggerData.length) insights.push(['💡', `${trigByEr[0].name} triggers drive the highest ER (${trigByEr[0].er}%) while ${triggerData[0].name} is most common (${triggerData[0].posts} posts)`]);
  if (categoryData.length) { const c = categoryData[0]; insights.push(['🏷️', `${c.name} is the largest category (${c.posts} posts) with ${c.er}% avg ER`]); }
  const peakHour = hourData.indexOf(Math.max(...hourData));
  if (posts.length) insights.push(['⏰', `Peak posting hour is ${String(peakHour).padStart(2, '0')}:00 WIB`]);

  const sponsoredInsights: string[] = [];
  if (organicStats.posts && sponsoredStats.posts) {
    sponsoredInsights.push(`Organic posts earn ${ratio(organicStats.likes, sponsoredStats.likes)}x more avg likes than sponsored posts (${fmtNum(organicStats.likes)} vs ${fmtNum(sponsoredStats.likes)})`);
    sponsoredInsights.push(`Organic ER is ${ratio(organicStats.er, sponsoredStats.er)}x higher than sponsored (${organicStats.er}% vs ${sponsoredStats.er}%)`);
  }
  if (posts.length) sponsoredInsights.push(`Sponsored posts make up ${(sponsored.length / posts.length * 100).toFixed(1)}% of viral posts in the current view`);

  const brandInsights: { title: string; text: string }[] = [];
  if (brandAccounts.length) { const a = brandAccounts[0]; brandInsights.push({ title: `📣 @${a.account} runs the most sponsored content`, text: `${a.sponsoredPosts} sponsored posts, mostly ${a.productType}` }); }
  if (multiAccountCampaigns.length) { const c = multiAccountCampaigns[0]; brandInsights.push({ title: `🤝 ${c.brandName} ran the widest campaign`, text: `${c.posts} posts across ${c.accounts.length} accounts (${c.accounts.map(a => a.handle).join(', ')}) for ${c.reach}` }); }
  const bestLikes = [...brandPerformanceData].filter(b => b.avgLikesValue > 0).sort((a, b) => b.avgLikesValue - a.avgLikesValue)[0];
  if (bestLikes) brandInsights.push({ title: `🌟 ${bestLikes.brandName} achieved the highest avg likes`, text: `${bestLikes.avgLikes} avg likes on ${bestLikes.accountsUsed}` });

  const pubDates = all.map(p => wibDate(p.published_at)).sort();
  const lastCapture = all.map(p => p.capture_date).sort().at(-1);
  const rangeLabel = pubDates.length ? `${dateLabel(pubDates[0])}–${dateLabel(pubDates[pubDates.length - 1])} ${pubDates[0].slice(0, 4)}` : '';

  return {
    total: all.length, dateOptions, brandOptions, kpis, contentData, categoryData, triggerData, shareData, hourData,
    accounts: accountRows, topPosts, organicStats, sponsoredStats, brandPerformanceData, brandCategoryBreakdown,
    multiAccountCampaigns, topBrandReachData, brandAccounts, insights, sponsoredInsights, brandInsights,
    rangeLabel, updatedLabel: lastCapture ? `${dateLabel(lastCapture)} ${lastCapture.slice(0, 4)}` : '',
    brandCount: brandPerformanceData.length,
  };
}

export type Dashboard = ReturnType<typeof buildDashboard>;
export const DashboardContext = createContext<Dashboard | null>(null);
export function useDash(): Dashboard {
  const d = useContext(DashboardContext);
  if (!d) throw new Error('DashboardContext missing');
  return d;
}
