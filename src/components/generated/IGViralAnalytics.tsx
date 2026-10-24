import { useMemo, useState } from 'react';
import { ArrowDown, Bot, ArrowUp, BarChart3, ExternalLink, Info, Instagram, Loader2, MoreHorizontal, Sparkles, Split, Tag, Tags, TrendingUp, Users } from 'lucide-react';
import { FilterBar, PostCategory } from './FilterBar';
import { EChart } from '../charts/EChart';
import { AgentChat } from '../agent/AgentChat';
import { donutOption, hBarOption, lineOption, theme, vBarOption } from '../charts/options';
import { buildDashboard, DashboardContext, useDash, useIgData } from '@/lib/igData';
type Metric = 'posts' | 'likes' | 'er';
type SponsoredMetric = 'likes' | 'er' | 'views';
type ContentType = 'All' | 'Reel' | 'Carousel' | 'Single Image';
type SortKey = 'account' | 'posts' | 'followers' | 'likes' | 'er';
type BrandSortKey = 'account' | 'followers' | 'sponsoredPosts';
type BrandPerformanceSortKey = 'brandName' | 'productService' | 'category' | 'posts' | 'accountsUsed' | 'reach' | 'avgER' | 'avgLikes' | 'contentType';
type Direction = 'asc' | 'desc';
type TabKey = 'overview' | 'sponsored' | 'brand' | 'agent';
type ContentDatum = {
  name: Exclude<ContentType, 'All'>;
  posts: number;
  likes: number;
  er: number;
  views?: number;
};
type Account = {
  account: string;
  posts: number;
  followers: string;
  likes: number;
  er: number;
};
type Post = {
  rank: number;
  account: string;
  type: Exclude<ContentType, 'All'>;
  category: string;
  likes: number;
  comments: number;
  er: number;
  caption: string;
};
type BrandAccount = {
  account: string;
  followers: string;
  followersValue: number;
  sponsoredPosts: number;
  productType: string;
  brandNames: string;
};
type BrandPerformance = {
  brandName: string;
  productService: string;
  category: string;
  posts: number;
  accountsUsed: string;
  reach: string;
  reachValue: number;
  avgER: string;
  avgERValue: number;
  avgLikes: string;
  avgLikesValue: number;
  contentType: string;
};
type BrandCategoryDatum = {
  name: string;
  count: number;
  color: string;
};
type CampaignAccount = {
  handle: string;
};
type MultiAccountCampaign = {
  brandName: string;
  product: string;
  accounts: CampaignAccount[];
  reach: string;
  posts: number;
  accent: string;
  note?: string;
};
type TopReachBrand = {
  brandName: string;
  category: string;
  posts: number;
  accounts: string;
  reach: string;
  reachValue: number;
  product: string;
  color: string;
};
type BrandInsight = {
  title: string;
  text: string;
};
const brandPerformanceColumns: {
  key: BrandPerformanceSortKey;
  label: string;
}[] = [{
  key: 'brandName',
  label: 'Brand Name'
}, {
  key: 'productService',
  label: 'Product/Service'
}, {
  key: 'category',
  label: 'Category'
}, {
  key: 'posts',
  label: 'Posts'
}, {
  key: 'accountsUsed',
  label: 'Accounts Used'
}, {
  key: 'reach',
  label: 'Est. Total Reach'
}, {
  key: 'avgER',
  label: 'Avg ER'
}, {
  key: 'avgLikes',
  label: 'Avg Likes'
}, {
  key: 'contentType',
  label: 'Content Type'
}];
const colors = ['#f97316', '#fb923c', '#f97316', '#fb923c', '#f97316', '#fb923c', '#f97316', '#fb923c'];
const brandMatch = (text: string, brands: string[]) => brands.some(b => text.toLowerCase().includes(b.toLowerCase().split(' (')[0].split(' x ')[0]));
const fmt = (value: number) => value.toLocaleString('en-US');
const erClass = (value: number) => value > 0.5 ? 'er-pill er-high' : value >= 0.2 ? 'er-pill er-mid' : 'er-pill er-low';
const tabs: {
  key: TabKey;
  label: string;
  icon: typeof BarChart3;
}[] = [{
  key: 'overview',
  label: 'Overview',
  icon: BarChart3
}, {
  key: 'sponsored',
  label: 'Org vs Spon',
  icon: Split
}, {
  key: 'brand',
  label: 'Brand Analytics',
  icon: Tags
}, {
  key: 'agent',
  label: 'Agent',
  icon: Bot
}];
const railItems: {
  label: string;
  tab: TabKey;
  icon: typeof BarChart3;
  primary: boolean;
}[] = [{
  label: 'Overview',
  tab: 'overview',
  icon: BarChart3,
  primary: true
}, {
  label: 'Accounts',
  tab: 'overview',
  icon: Users,
  primary: false
}, {
  label: 'Sponsored',
  tab: 'sponsored',
  icon: TrendingUp,
  primary: true
}, {
  label: 'Brand',
  tab: 'brand',
  icon: Tag,
  primary: true
}, {
  label: 'Agent',
  tab: 'agent',
  icon: Bot,
  primary: true
}];
function SectionHeading({
  eyebrow,
  title,
  action
}: {
  eyebrow?: string;
  title: string;
  action?: string;
}) {
  return <header className="section-heading"><div><p className="eyebrow">{eyebrow ?? 'Performance'}</p><h2>{title}<Info size={12} className="info-icon" /></h2></div>{action && <span className="muted-action">{action}</span>}</header>;
}
function Toggle({
  value,
  active,
  onClick
}: {
  value: Metric;
  active: Metric;
  onClick: (value: Metric) => void;
}) {
  return <button className={active === value ? 'toggle active' : 'toggle'} onClick={() => onClick(value)}>{value === 'posts' ? 'Posts' : value === 'likes' ? 'Avg Likes' : 'Avg ER'}</button>;
}
function MiniBars({
  data,
  metric,
  onHover
}: {
  data: ContentDatum[];
  metric: Metric;
  onHover: (value: string | null) => void;
}) {
  const option = useMemo(() => hBarOption({
    data: data.map(item => ({ name: item.name, value: item[metric], color: item.name === 'Reel' ? theme.orange : item.name === 'Carousel' ? theme.blue : theme.muted })),
    format: v => metric === 'er' ? `${v}%` : fmt(v),
    labelWidth: 96,
    valueWidth: 60,
    tooltipText: i => { const item = data[i]; return `<b>${item.name}</b><br/>${fmt(item.posts)} posts · ${fmt(item.likes)} avg likes · ${item.er}% ER${item.views ? `<br/>${fmt(item.views)} avg views` : ''}`; },
  }), [data, metric]);
  return <EChart option={option} height={data.length * 34} ariaLabel="Content type performance bar chart" />;
}
function AnalyticsChart({
  title,
  eyebrow,
  data,
  type,
  metric,
  setMetric
}: {
  title: string;
  eyebrow: string;
  data: {
    name: string;
    posts: number;
    likes: number;
    er: number;
  }[];
  type: 'category' | 'trigger';
  metric: Metric;
  setMetric: (value: Metric) => void;
}) {
  const option = useMemo(() => hBarOption({
    data: data.map(item => ({ name: item.name, value: item[metric] })),
    format: v => metric === 'er' ? `${v}%` : fmt(v),
    labelWidth: 150,
    tooltipText: i => `<b>${data[i].name}</b><br/>${fmt(data[i].posts)} posts · ${fmt(data[i].likes)} avg likes · ${data[i].er}% ER`,
  }), [data, metric]);
  return <section className="panel chart-panel"><div className="chart-head"><SectionHeading eyebrow={eyebrow} title={title} /><div className="toggle-group"><Toggle value="posts" active={metric} onClick={setMetric} /><Toggle value="likes" active={metric} onClick={setMetric} /><Toggle value="er" active={metric} onClick={setMetric} /></div></div><EChart option={option} height={data.length * 30} ariaLabel={`${title} bar chart`} /></section>;
}
function SponsoredBarGroup({
  metric,
  setMetric
}: {
  metric: SponsoredMetric;
  setMetric: (value: SponsoredMetric) => void;
}) {
  const { organicStats, sponsoredStats } = useDash();
  const labels: Record<SponsoredMetric, string> = { likes: 'Avg likes', er: 'Avg ER', views: 'Avg views' };
  const formatValue = (value: number) => metric === 'er' ? `${value}%` : fmt(value);
  const option = useMemo(() => vBarOption({
    data: [{ name: 'Organic', value: organicStats[metric], color: theme.orange }, { name: 'Sponsored', value: sponsoredStats[metric], color: theme.blue }],
    format: formatValue,
    barMaxWidth: 72,
    tooltipText: i => `${i === 0 ? 'Organic' : 'Sponsored'} · ${labels[metric]}<br/><b style="font-family:${theme.mono}">${formatValue(i === 0 ? organicStats[metric] : sponsoredStats[metric])}</b>`,
  }), [metric, organicStats, sponsoredStats]);
  return <EChart option={option} height={220} ariaLabel="Organic vs sponsored comparison bar chart" />;
}
function BrandTable({
  brands
}: {
  brands: string[];
}) {
  const { brandAccounts } = useDash();
  const [sortKey, setSortKey] = useState<BrandSortKey>('sponsoredPosts');
  const [direction, setDirection] = useState<Direction>('desc');
  const sorted = useMemo(() => [...brandAccounts].filter(row => brands.length === 0 || brandMatch(row.brandNames, brands)).sort((a, b) => {
    const left = sortKey === 'followers' ? a.followersValue : sortKey === 'account' ? a.account : a.sponsoredPosts;
    const right = sortKey === 'followers' ? b.followersValue : sortKey === 'account' ? b.account : b.sponsoredPosts;
    const result = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right));
    return direction === 'asc' ? result : -result;
  }), [sortKey, direction, brands, brandAccounts]);
  const sortBy = (key: BrandSortKey) => {
    if (sortKey === key) setDirection(direction === 'asc' ? 'desc' : 'asc');else {
      setSortKey(key);
      setDirection('desc');
    }
  };
  const columns: {
    key: BrandSortKey;
    label: string;
  }[] = [{
    key: 'account',
    label: 'Account'
  }, {
    key: 'followers',
    label: 'Followers'
  }, {
    key: 'sponsoredPosts',
    label: 'Sponsored Posts'
  }];
  return <section className="panel" style={{
    gridColumn: 'span 12'
  }}>
    <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
      <div>
        <p className="eyebrow">Attribution</p>
        <h2 className="m-0 text-[15px] font-semibold tracking-tight text-slate-200">Sponsored Posts by Account</h2>
        <p className="mt-1.5 mb-0 text-[11px] text-slate-500">(Real brand data extracted from monetization_signals.product_mentioned.name)</p>
      </div>
    </div>
    <div className="table-scroll mt-5">
      <table>
        <thead>
          <tr>
            {columns.map(col => <th key={col.key}>
              <button onClick={() => sortBy(col.key)}>
                {col.label}
                {sortKey === col.key && (direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
              </button>
            </th>)}
            <th>Product Type</th>
            <th>Brand Name(s)</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(row => <tr key={row.account}>
            <td><span className="account-avatar">{row.account.slice(0, 1).toUpperCase()}</span>@{row.account}</td>
            <td>{row.followers}</td>
            <td>
              <span className="inline-flex items-center rounded-md bg-orange-500/10 text-orange-400 px-2 py-0.5 text-[12px] mono">
                {row.sponsoredPosts}
              </span>
            </td>
            <td>
              <span className="inline-flex items-center rounded-[5px] bg-[#27272a] text-zinc-400 px-2 py-0.5 text-[11px] whitespace-nowrap">
                {row.productType}
              </span>
            </td>
            <td className="max-w-[420px] whitespace-normal text-zinc-300 text-[12px] leading-snug">
              {row.brandNames}
            </td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </section>;
}
function SponsoredView({
  brands
}: {
  brands: string[];
}) {
  const [metric, setMetric] = useState<SponsoredMetric>('likes');
  const { organicStats, sponsoredStats, sponsoredInsights } = useDash();
  const totalSponsorshipPosts = organicStats.posts + sponsoredStats.posts;
  const organicShare = totalSponsorshipPosts ? organicStats.posts / totalSponsorshipPosts * 100 : 0;
  const sponsoredShare = totalSponsorshipPosts ? sponsoredStats.posts / totalSponsorshipPosts * 100 : 0;
  const x = (a: number, b: number) => b > 0 ? (a / b).toFixed(1) : '—';
  const likesDelta = x(organicStats.likes, sponsoredStats.likes);
  const erDelta = x(organicStats.er, sponsoredStats.er);
  const viewsDelta = x(organicStats.views, sponsoredStats.views);
  return <section>
    <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
      {[{
        label: 'Posts',
        organic: fmt(organicStats.posts),
        sponsored: fmt(sponsoredStats.posts),
        delta: `Organic ${x(organicStats.posts, sponsoredStats.posts)}x more posts`
      }, {
        label: 'Avg Likes',
        organic: fmt(organicStats.likes),
        sponsored: fmt(sponsoredStats.likes),
        delta: `Organic ${likesDelta}x higher likes`
      }, {
        label: 'Avg ER',
        organic: `${organicStats.er}%`,
        sponsored: `${sponsoredStats.er}%`,
        delta: `Organic ${erDelta}x higher ER`
      }, {
        label: 'Avg Views',
        organic: fmt(organicStats.views),
        sponsored: fmt(sponsoredStats.views),
        delta: `Organic ${viewsDelta}x higher views`
      }].map(card => <article key={card.label} className="rounded-xl border border-[#27272a] bg-[#18181b] overflow-hidden flex flex-col">
        <div className="flex flex-1 gap-3 p-4">
          <div className="flex-1 border-l-2 border-orange-500 pl-3">
            <p className="m-0 text-[11px] text-zinc-500">Organic</p>
            <strong className="block mt-1 text-xl font-semibold text-zinc-50 mono">{card.organic}</strong>
          </div>
          <div className="flex-1 border-l-2 border-blue-500 pl-3">
            <p className="m-0 text-[11px] text-zinc-500">Sponsored</p>
            <strong className="block mt-1 text-xl font-semibold text-zinc-50 mono">{card.sponsored}</strong>
          </div>
        </div>
        <div className="px-4 py-2.5 border-t border-[#27272a] flex items-center justify-between gap-2">
          <span className="text-[11px] uppercase tracking-wide text-zinc-500 font-medium">{card.label}</span>
          <span className="rounded-md bg-green-500/10 text-green-400 px-2 py-0.5 text-[11px] mono whitespace-nowrap">{card.delta}</span>
        </div>
      </article>)}
    </section>
    <section className="charts-grid">
      <section className="panel" style={{
        gridColumn: 'span 5'
      }}>
        <SectionHeading eyebrow="Distribution" title="Post Volume Split" />
        <div className="flex flex-col items-center gap-5 mt-2">
          <div className="donut-wrap">
            <EChart height={140} width={140} ariaLabel="Organic and sponsored post volume split" option={donutOption({ data: [{ name: 'Organic', value: organicStats.posts, color: theme.orange }, { name: 'Sponsored', value: sponsoredStats.posts, color: theme.blue }], centerValue: String(totalSponsorshipPosts), centerLabel: 'total posts', format: v => `${fmt(v)} posts` })} />
          </div>
          <div className="w-full grid grid-cols-2 gap-3 text-center">
            <div>
              <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 font-medium"><i className="dot purple" />Organic</span>
              <strong className="block mt-1 text-base font-bold text-white">{organicShare.toFixed(1)}%</strong>
            </div>
            <div>
              <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 font-medium"><i className="dot cyan" />Sponsored</span>
              <strong className="block mt-1 text-base font-bold text-white">{sponsoredShare.toFixed(1)}%</strong>
            </div>
          </div>
        </div>
      </section>
      <section className="panel" style={{
        gridColumn: 'span 7'
      }}>
        <div className="chart-head">
          <SectionHeading eyebrow="Head to head" title="Organic vs Sponsored — Key Metrics Comparison" />
          <div className="toggle-group">
            <button className={metric === 'likes' ? 'toggle active' : 'toggle'} onClick={() => setMetric('likes')}>Avg Likes</button>
            <button className={metric === 'er' ? 'toggle active' : 'toggle'} onClick={() => setMetric('er')}>Avg ER</button>
            <button className={metric === 'views' ? 'toggle active' : 'toggle'} onClick={() => setMetric('views')}>Avg Views</button>
          </div>
        </div>
        <SponsoredBarGroup metric={metric} setMetric={setMetric} />
      </section>
    </section>
    <section className="lower-grid mt-4" style={{
      gridTemplateColumns: '1fr'
    }}>
      <BrandTable brands={brands} />
    </section>
    <section className="mt-4">
      <aside className="panel insights-panel">
        <SectionHeading eyebrow="What matters" title="Organic vs Sponsored Insights" />
        <ol>
          {sponsoredInsights.map((text, index) => <li key={text}>
            <span className="insight-number">{index + 1}</span>
            <span className="insight-icon">{index === 0 ? '❤️' : index === 1 ? '⚡' : '📣'}</span>
            <p>{text}</p>
          </li>)}
        </ol>
      </aside>
    </section>
  </section>;
}
function BrandAnalyticsView({
  brands
}: {
  brands: string[];
}) {
  const { brandPerformanceData, brandCategoryBreakdown, multiAccountCampaigns, topBrandReachData, brandInsights, brandCount } = useDash();
  const [sortKey, setSortKey] = useState<BrandPerformanceSortKey>('posts');
  const [direction, setDirection] = useState<Direction>('desc');
  const sortedBrandRows = useMemo(() => [...brandPerformanceData].sort((a, b) => {
    const left = sortKey === 'reach' ? a.reachValue : sortKey === 'avgER' ? a.avgERValue : sortKey === 'avgLikes' ? a.avgLikesValue : a[sortKey];
    const right = sortKey === 'reach' ? b.reachValue : sortKey === 'avgER' ? b.avgERValue : sortKey === 'avgLikes' ? b.avgLikesValue : b[sortKey];
    const result = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right));
    return direction === 'asc' ? result : -result;
  }), [sortKey, direction, brandPerformanceData]);
  const sortBrandRows = (key: BrandPerformanceSortKey) => {
    if (sortKey === key) setDirection(direction === 'asc' ? 'desc' : 'asc');else {
      setSortKey(key);
      setDirection('desc');
    }
  };
  const brandDonut = useMemo(() => donutOption({ data: brandCategoryBreakdown.map(item => ({ name: item.name, value: item.count, color: item.color })), centerValue: String(brandCategoryBreakdown.reduce((a, c) => a + c.count, 0)), centerLabel: 'brands', format: v => `${v} brands` }), [brandCategoryBreakdown]);
  const reachOption = useMemo(() => hBarOption({
    data: topBrandReachData.map(item => ({ name: item.brandName, value: item.reachValue, color: item.color, label: item.reach })),
    format: v => `~${v}M`,
    labelWidth: 190,
    valueWidth: 60,
    tooltipText: i => { const item = topBrandReachData[i]; return `<b>${item.brandName}</b> <span style="color:${theme.subtle}">· ${item.category}</span><br/>${item.posts} posts · ${item.accounts}<br/><b style="font-family:${theme.mono}">${item.reach}</b> est. followers reach · ${item.product}`; },
  }), [topBrandReachData]);
  return <section className="brand-analytics-view">
    <section className="panel brand-table-panel">
      <div className="brand-dashboard-heading">
        <div>
          <p className="eyebrow">Brand performance</p>
          <h2>Sponsored Posts by Brand</h2>
          <p>Brand attribution from brand_name · live from Supabase</p>
        </div>
        <span className="brand-count-badge">{brandCount} attributed brands</span>
      </div>
      <div className="table-scroll brand-table-scroll">
        <table className="brand-performance-table">
          <thead>
            <tr>
              {brandPerformanceColumns.map(column => <th key={column.key}>
                <button className={sortKey === column.key ? 'active-sort' : ''} onClick={() => sortBrandRows(column.key)}>
                  <span>{column.label}</span>
                  {sortKey === column.key && (direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                </button>
              </th>)}
            </tr>
          </thead>
          <tbody>
            {sortedBrandRows.map(row => <tr key={row.brandName} style={brands.length && brandMatch(row.brandName, brands) ? {
              background: 'rgba(249,115,22,.1)',
              boxShadow: 'inset 2px 0 0 #f97316'
            } : undefined}>
              <td><strong>{row.brandName}</strong></td>
              <td className="brand-product-cell">{row.productService}</td>
              <td><span className="category-badge">{row.category}</span></td>
              <td><span className="brand-post-pill">{row.posts}</span></td>
              <td>{row.accountsUsed}</td>
              <td><span className="brand-reach-pill">{row.reach}</span></td>
              <td>{row.avgER}</td>
              <td>{row.avgLikes}</td>
              <td><span className="type-badge">{row.contentType}</span></td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>
    <section className="brand-mid-grid">
      <section className="panel brand-donut-panel">
        <SectionHeading eyebrow="Category mix" title="Brands by Category" />
        <div className="brand-donut-layout">
          <div className="brand-donut-wrap">
            <EChart height={160} width={160} ariaLabel="Brands by category donut chart" option={brandDonut} />
          </div>
          <ul className="brand-category-list">
            {brandCategoryBreakdown.map(item => <li key={item.name}>
              <span><i style={{
                  background: item.color
                }} />{item.name}</span>
              <strong>{item.count}</strong>
            </li>)}
          </ul>
        </div>
      </section>
      <section className="panel campaign-panel">
        <div className="brand-dashboard-heading compact">
          <div>
            <p className="eyebrow">Campaign coordination</p>
            <h2>Multi-Account Brand Campaigns</h2>
            <p>Brands that ran coordinated posts across 2+ accounts simultaneously</p>
          </div>
        </div>
        <div className="campaign-card-list">
          {multiAccountCampaigns.map(campaign => <article className="campaign-card" key={campaign.brandName} style={{
            borderLeftColor: campaign.accent
          }}>
            <span className="campaign-initial" style={{
              color: campaign.accent,
              background: `${campaign.accent}22`
            }}>{campaign.brandName.slice(0, 1)}</span>
            <div className="campaign-main">
              <div className="campaign-title-row">
                <h3>{campaign.brandName}</h3>
                <span className="brand-reach-pill">{campaign.reach}</span>
              </div>
              <p>{campaign.product}</p>
              <div className="campaign-handles">
                {campaign.accounts.map(account => <span key={account.handle}>{account.handle}</span>)}
              </div>
              {campaign.note && <small>{campaign.note}</small>}
            </div>
            <strong className="campaign-post-count">{campaign.posts} posts</strong>
          </article>)}
        </div>
      </section>
    </section>
    <section className="panel brand-reach-panel">
      <SectionHeading eyebrow="Audience potential" title="Top Brands by Estimated Total Reach" />
      <EChart option={reachOption} height={topBrandReachData.length * 32} ariaLabel="Top brands by estimated reach" />
    </section>
    <section className="brand-insight-grid">
      {brandInsights.map(insight => <article className="panel brand-insight-card" key={insight.title}>
        <h3>{insight.title}</h3>
        <p>{insight.text}</p>
      </article>)}
    </section>
  </section>;
}
export function IGViralAnalytics() {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [contentMetric, setContentMetric] = useState<Metric>('posts');
  const [categoryMetric, setCategoryMetric] = useState<Metric>('posts');
  const [triggerMetric, setTriggerMetric] = useState<Metric>('posts');
  const [filter, setFilter] = useState<ContentType>('All');
  const [sortKey, setSortKey] = useState<SortKey>('posts');
  const [direction, setDirection] = useState<Direction>('desc');
  const [dates, setDates] = useState<string[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [postCategory, setPostCategory] = useState<PostCategory>('All');
  const { data, error, reload } = useIgData();
  const D = useMemo(() => data ? buildDashboard(data, { dates, brands, type: filter, category: postCategory }) : null, [data, dates, brands, filter, postCategory]);
  const overviewDonut = useMemo(() => D ? donutOption({ data: [{ name: 'Organic', value: D.organicStats.posts, color: theme.orange }, { name: 'Sponsored', value: D.sponsoredStats.posts, color: theme.blue }], centerValue: String(D.kpis.posts), centerLabel: 'posts', format: v => `${fmt(v)} posts` }) : null, [D]);
  const shareOption = useMemo(() => D ? hBarOption({ data: D.shareData.map((item, index) => ({ name: item.name, value: item.value, color: colors[index % colors.length] })), format: v => fmt(v), labelWidth: 150, tooltipText: i => `${D.shareData[i].name}<br/><b style="font-family:${theme.mono}">${D.shareData[i].value}</b> posts` }) : null, [D]);
  const hourLabels = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'));
  const peakIndex = D ? D.hourData.indexOf(Math.max(...D.hourData)) : 0;
  const hourOption = useMemo(() => D ? lineOption({ labels: hourLabels, values: D.hourData, peakIndex, tooltipText: i => `${hourLabels[i]}:00 WIB<br/><b style="font-family:${theme.mono}">${D.hourData[i]}</b> posts` }) : null, [D]);
  const changeCategory = (value: PostCategory) => {
    setPostCategory(value);
    if (value === 'Sponsored') setActiveTab('sponsored');
  };
  const resetFilters = () => {
    setDates([]);
    setBrands([]);
    setFilter('All');
    setPostCategory('All');
  };
  const sortedAccounts = useMemo(() => [...(D?.accounts ?? [])].sort((a, b) => {
    const left = sortKey === 'followers' ? a.followersValue : a[sortKey];
    const right = sortKey === 'followers' ? b.followersValue : b[sortKey];
    const result = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right));
    return direction === 'asc' ? result : -result;
  }).slice(0, 15), [D, sortKey, direction]);
  const sortAccounts = (key: SortKey) => {
    if (sortKey === key) setDirection(direction === 'asc' ? 'desc' : 'asc');else {
      setSortKey(key);
      setDirection('desc');
    }
  };
  const shownCount = D?.kpis.posts ?? 0;
  return <main className="dashboard-shell">
    <aside className="side-rail" aria-label="Primary">
      <span className="instagram-mark"><Instagram size={15} /></span>
      <nav className="rail-nav">
        {railItems.map(item => {
          const Icon = item.icon;
          return <button key={item.label} data-label={item.label} aria-label={item.label} className={activeTab === item.tab && item.primary ? 'rail-btn active' : 'rail-btn'} onClick={() => setActiveTab(item.tab)}><Icon size={18} /></button>;
        })}
      </nav>
      <span className="rail-avatar">HM</span>
    </aside>
    <div className="dashboard-container">
      <header className="top-header">
        <p className="crumbs"><span>Analytics</span><span>›</span><strong>{tabs.find(t => t.key === activeTab)?.label}</strong></p>
        <nav className="tab-nav" aria-label="Analytics sections">{tabs.map(tab => {
            const Icon = tab.icon;
            return <button key={tab.key} className={activeTab === tab.key ? 'tab-pill active' : 'tab-pill'} onClick={() => setActiveTab(tab.key)}><Icon size={14} /><span>{tab.label}</span></button>;
          })}</nav>
        <span className="theme-badge">{D ? `${D.rangeLabel} · ${fmt(D.total)} posts` : 'Loading…'}</span>
      </header>
      {activeTab === 'agent' ? <AgentChat /> : error ? <section className="flex flex-col items-center gap-3 py-24 text-center"><p className="m-0 text-[13px] text-zinc-400">Couldn't load data from Supabase: {error}</p><button className="filter-chip" onClick={reload}>Retry</button></section> : !D ? <section className="flex flex-col items-center gap-3 py-24 text-center"><Loader2 size={20} className="auth-spin" /><p className="m-0 text-[13px] text-zinc-500">Loading data from Supabase…</p></section> : <DashboardContext.Provider value={D}>
      <FilterBar dates={dates} setDates={setDates} brands={brands} setBrands={setBrands} type={filter} setType={setFilter} category={postCategory} setCategory={changeCategory} shown={shownCount} total={D.total} dateOptions={D.dateOptions} brandOptions={D.brandOptions} onReset={resetFilters} />
      {activeTab === 'overview' && brands.length > 0 && <p className="mt-4 mb-0 inline-flex items-center gap-1.5 rounded-md border border-[#27272a] bg-[#18181b] px-2.5 py-1 text-[12px] text-zinc-400"><span className="w-1.5 h-1.5 rounded-full bg-orange-500" /><span>Filtered: {brands.join(', ')}</span></p>}
      {shownCount === 0 ? <section className="flex flex-col items-center gap-3 py-24 text-center"><p className="m-0 text-[13px] text-zinc-600">No posts match the selected filters</p><button className="filter-chip" onClick={resetFilters}>Reset</button></section> : <>
      <section className="kpi-grid">{([['Total Posts', fmt(D.kpis.posts), '', 'blue'], ['Total Likes', fmt(D.kpis.likes), '', 'orange'], ['Total Comments', fmt(D.kpis.comments), '', 'orange'], ['Total Reposts', fmt(D.kpis.reposts), '', 'orange'], ['Reel Views', fmt(D.kpis.reelViews), `${fmt(D.kpis.reels)} reels`, 'blue'], ['Avg ER by followers', `${D.kpis.avgER}%`, `median ${D.kpis.medianER}%`, 'orange']] as const).map(([label, value, trend, tone]) => <article className={`kpi-card ${tone}`} key={label}><div className="kpi-label"><p>{label}</p><Info size={12} className="info-icon" /></div><strong>{value}</strong>{trend ? <span className="trend-chip">{trend}</span> : null}</article>)}</section>
      {activeTab === 'brand' ? <BrandAnalyticsView brands={brands} /> : activeTab === 'sponsored' ? <SponsoredView brands={brands} /> : <section>
      <section className="charts-grid">
        <section className="panel content-performance"><div className="chart-head"><SectionHeading eyebrow="Format mix" title="Content Type Performance" /><div className="toggle-group"><Toggle value="posts" active={contentMetric} onClick={setContentMetric} /><Toggle value="likes" active={contentMetric} onClick={setContentMetric} /><Toggle value="er" active={contentMetric} onClick={setContentMetric} /></div></div><MiniBars data={D.contentData} metric={contentMetric} onHover={() => undefined} /><div className="legend-note"><span className="legend-dot purple" />Reel <span className="legend-dot cyan" />Carousel <span className="legend-dot indigo" />Single Image</div></section>
        <section className="panel organic-panel"><SectionHeading eyebrow="Distribution" title="Organic vs Sponsored" /><div className="organic-layout"><div className="donut-wrap">{overviewDonut && <EChart height={140} width={140} ariaLabel="Organic and sponsored post split" option={overviewDonut} />}</div><div className="organic-stats"><div><span className="stat-name"><i className="dot purple" />Organic</span><strong>{fmt(D.organicStats.posts)} <small>posts</small></strong><p>{fmt(D.organicStats.likes)} avg likes · <b>{D.organicStats.er}%</b> ER</p></div><div><span className="stat-name"><i className="dot cyan" />Sponsored</span><strong>{fmt(D.sponsoredStats.posts)} <small>posts</small></strong><p>{fmt(D.sponsoredStats.likes)} avg likes · <b>{D.sponsoredStats.er}%</b> ER</p></div></div></div><div className="views-compare"><span>Avg views</span><b>{fmt(D.organicStats.views)} <em>organic</em></b><b>{fmt(D.sponsoredStats.views)} <em className="cyan-text">sponsored</em></b></div></section>
        <AnalyticsChart title="Viral Category Breakdown" eyebrow="Content taxonomy" data={D.categoryData} type="category" metric={categoryMetric} setMetric={setCategoryMetric} />
        <AnalyticsChart title="Primary Viral Trigger" eyebrow="Psychology" data={D.triggerData} type="trigger" metric={triggerMetric} setMetric={setTriggerMetric} />
        <section className="panel share-panel"><SectionHeading eyebrow="Sharing behavior" title="Share Driver Distribution" />{shareOption && <EChart option={shareOption} height={Math.max(1, D.shareData.length) * 30} ariaLabel="Share driver distribution bar chart" />}</section>
        <section className="panel hours-panel"><SectionHeading eyebrow="Timing signal" title="Posting Hour Distribution (WIB)" action={`Peak: ${hourLabels[peakIndex]}:00`} />{hourOption && <EChart option={hourOption} height={190} ariaLabel="Posting hour line chart" />}</section>
      </section>
      <section className="lower-grid"><section className="panel accounts-panel"><SectionHeading eyebrow="Audience leaders" title="Top Accounts by Post Volume" action={`${D.accounts.length} accounts`} /><div className="table-scroll"><table><thead><tr>{[['account', 'Account'], ['posts', 'Posts'], ['followers', 'Followers'], ['likes', 'Avg Likes'], ['er', 'Avg ER']].map(([key, label]) => <th key={key}><button onClick={() => sortAccounts(key as SortKey)}>{label}{sortKey === key && (direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}</button></th>)}</tr></thead><tbody>{sortedAccounts.map(account => <tr key={account.account}><td><span className="account-avatar">{account.account.slice(0, 1).toUpperCase()}</span>@{account.account}</td><td>{account.posts}</td><td>{account.followers}</td><td>{fmt(account.likes)}</td><td><span className={erClass(account.er)}>{account.er}%</span></td></tr>)}</tbody></table></div></section>
        <aside className="panel insights-panel"><SectionHeading eyebrow="What matters" title="Key Insights" /><ol>{D.insights.map(([icon, text], index) => <li key={text}><span className="insight-number">{index + 1}</span><span className="insight-icon">{icon}</span><p>{text}</p></li>)}</ol></aside></section>
      <section className="panel posts-panel"><div className="posts-heading"><SectionHeading eyebrow="Leaderboard" title="Top Posts by Likes" /></div>{D.topPosts.length === 0 ? <div className="flex flex-col items-center gap-3 py-10"><p className="m-0 text-[13px] text-zinc-600">No posts match the selected filters</p><button className="filter-chip" onClick={resetFilters}>Reset</button></div> : null}<div className="post-list">{D.topPosts.map(post => <article className="post-row" key={post.rank}><span className="rank-badge">{post.rank}</span><div className="post-main"><div className="post-meta"><strong>@{post.account}</strong><span className="type-badge">{post.type}</span><span className="category-badge">{post.category}</span></div><p>{post.caption}</p></div><div className="post-metric"><strong>{fmt(post.likes)}</strong><span>likes</span></div><div className="post-metric"><strong>{fmt(post.comments)}</strong><span>comments</span></div><div className="post-metric er-metric"><strong>{post.er}%</strong><span>ER</span></div>{post.url ? <a className="more-button" href={post.url} target="_blank" rel="noreferrer" aria-label={`Open post ${post.rank} on Instagram`}><ExternalLink size={16} /></a> : <span className="more-button"><MoreHorizontal size={18} /></span>}</article>)}</div></section>
      </section>}
      </>}
      </DashboardContext.Provider>}
      {activeTab !== 'agent' && <footer className="footer-note"><span><Sparkles size={14} />Built for signal, not noise.</span><span>Data IG (HM) · Live from Supabase{D?.updatedLabel ? ` · Updated ${D.updatedLabel}` : ''}</span></footer>}
    </div>
  </main>;
}