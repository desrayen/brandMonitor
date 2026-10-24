import { useMemo, useState } from 'react';
import { Activity, ArrowDown, Bot, ArrowUp, BarChart3, Eye, Heart, Info, Instagram, MessageCircle, MoreHorizontal, Repeat2, Sparkles, Split, Tag, Tags, TrendingUp, Users, Zap } from 'lucide-react';
import { FilterBar, PostCategory } from './FilterBar';
import { EChart } from '../charts/EChart';
import { AgentChat } from '../agent/AgentChat';
import { donutOption, hBarOption, lineOption, theme, vBarOption } from '../charts/options';
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
const brandPerformanceData: BrandPerformance[] = [{
  brandName: 'Jumbo Seafood',
  productService: 'Chili crab & seafood',
  category: 'F&B',
  posts: 4,
  accountsUsed: '@jktfoodbang',
  reach: '~1M',
  reachValue: 1,
  avgER: 'low',
  avgERValue: -1,
  avgLikes: '~50',
  avgLikesValue: 50,
  contentType: 'Reel'
}, {
  brandName: 'Moggumung KBBQ',
  productService: 'Korean BBQ',
  category: 'F&B',
  posts: 3,
  accountsUsed: '@jktfoodbang',
  reach: '~1M',
  reachValue: 1,
  avgER: 'low',
  avgERValue: -1,
  avgLikes: '~650',
  avgLikesValue: 650,
  contentType: 'Reel'
}, {
  brandName: 'Ebiga',
  productService: 'Korean food (Bulgogi Bap, Nikudon)',
  category: 'F&B',
  posts: 2,
  accountsUsed: '@jktfoodbang',
  reach: '~1M',
  reachValue: 1,
  avgER: 'low',
  avgERValue: -1,
  avgLikes: '~300',
  avgLikesValue: 300,
  contentType: 'Reel'
}, {
  brandName: 'Wonsot',
  productService: 'Sotbap (Korean rice)',
  category: 'F&B',
  posts: 3,
  accountsUsed: '@jktfoodbang',
  reach: '~1M',
  reachValue: 1,
  avgER: 'low',
  avgERValue: -1,
  avgLikes: '~230',
  avgLikesValue: 230,
  contentType: 'Reel'
}, {
  brandName: 'Hwaro',
  productService: 'AYCE wagyu grill',
  category: 'F&B',
  posts: 2,
  accountsUsed: '@jktfoodbang',
  reach: '~1M',
  reachValue: 1,
  avgER: 'low',
  avgERValue: -1,
  avgLikes: '~170',
  avgLikesValue: 170,
  contentType: 'Reel'
}, {
  brandName: 'Himizu',
  productService: 'Japanese modern cuisine',
  category: 'F&B',
  posts: 2,
  accountsUsed: '@jktfoodbang',
  reach: '~1M',
  reachValue: 1,
  avgER: 'low',
  avgERValue: -1,
  avgLikes: '~185',
  avgLikesValue: 185,
  contentType: 'Reel'
}, {
  brandName: 'Ask For Patty',
  productService: 'Burger',
  category: 'F&B',
  posts: 2,
  accountsUsed: '@jktfoodbang',
  reach: '~1M',
  reachValue: 1,
  avgER: 'low',
  avgERValue: -1,
  avgLikes: '~357',
  avgLikesValue: 357,
  contentType: 'Reel'
}, {
  brandName: 'Yakitate Kalbi',
  productService: 'Nikudon series',
  category: 'F&B',
  posts: 2,
  accountsUsed: '@jktfoodbang',
  reach: '~1M',
  reachValue: 1,
  avgER: 'low',
  avgERValue: -1,
  avgLikes: '~268',
  avgLikesValue: 268,
  contentType: 'Reel'
}, {
  brandName: 'Duree Gading Serpong',
  productService: 'Premium durian',
  category: 'F&B/Dessert',
  posts: 2,
  accountsUsed: '@jktfoodbang',
  reach: '~1M',
  reachValue: 1,
  avgER: 'low',
  avgERValue: -1,
  avgLikes: '~311',
  avgLikesValue: 311,
  contentType: 'Reel'
}, {
  brandName: 'Cilok DPR',
  productService: 'Cilok mentai keju',
  category: 'Snack',
  posts: 2,
  accountsUsed: '@jktfoodbang',
  reach: '~1M',
  reachValue: 1,
  avgER: 'low',
  avgERValue: -1,
  avgLikes: '~212',
  avgLikesValue: 212,
  contentType: 'Reel'
}, {
  brandName: 'Fround',
  productService: 'Greek froyo',
  category: 'Dessert',
  posts: 2,
  accountsUsed: '@jktfoodbang',
  reach: '~1M',
  reachValue: 1,
  avgER: 'low',
  avgERValue: -1,
  avgLikes: '~461',
  avgLikesValue: 461,
  contentType: 'Reel'
}, {
  brandName: 'Bango (Festival Jajanan Bango)',
  productService: 'Culinary festival event',
  category: 'F&B Event',
  posts: 2,
  accountsUsed: '@jktfoodbang',
  reach: '~1M',
  reachValue: 1,
  avgER: 'low',
  avgERValue: -1,
  avgLikes: '~117',
  avgLikesValue: 117,
  contentType: 'Reel'
}, {
  brandName: 'JKTGO App',
  productService: 'Buy 1 Get 1 milk tea (own platform)',
  category: 'F&B/App',
  posts: 2,
  accountsUsed: '@jktgo',
  reach: '~2M',
  reachValue: 2,
  avgER: '0.12%',
  avgERValue: 0.12,
  avgLikes: '~1,840',
  avgLikesValue: 1840,
  contentType: 'Reel'
}, {
  brandName: 'Jakarta Running Festival',
  productService: 'Official merch (Adidas, Corkcicle) on Shopee',
  category: 'Sports Event',
  posts: 2,
  accountsUsed: '@folkative, @abouthetic',
  reach: '~10M',
  reachValue: 10,
  avgER: 'low',
  avgERValue: -1,
  avgLikes: 'hidden',
  avgLikesValue: -1,
  contentType: 'Carousel/Reel'
}, {
  brandName: 'Pop Mie x Pokémon',
  productService: 'The Taste Adventure event (instant noodle)',
  category: 'F&B/Event',
  posts: 3,
  accountsUsed: '@abouthetic, @jktgo, @jkt.do',
  reach: '~8M',
  reachValue: 8,
  avgER: 'low',
  avgERValue: -1,
  avgLikes: 'hidden',
  avgLikesValue: -1,
  contentType: 'Reel'
}, {
  brandName: 'Le Minerale',
  productService: 'Running Squad / mineral water',
  category: 'Beverage',
  posts: 2,
  accountsUsed: '@infipop.id, @kumparancom',
  reach: '~4M',
  reachValue: 4,
  avgER: 'low',
  avgERValue: -1,
  avgLikes: '~563',
  avgLikesValue: 563,
  contentType: 'Reel/Carousel'
}, {
  brandName: 'Bank Syariah Indonesia',
  productService: 'BSI International Expo 2026',
  category: 'Banking/Event',
  posts: 3,
  accountsUsed: '@ussfeeds, @jakartazoone, @kumparancom',
  reach: '~8M',
  reachValue: 8,
  avgER: 'low',
  avgERValue: -1,
  avgLikes: '~820',
  avgLikesValue: 820,
  contentType: 'Reel/Carousel'
}, {
  brandName: 'Green SM',
  productService: 'Driver recruitment (electric mobility)',
  category: 'Mobility/Job',
  posts: 4,
  accountsUsed: '@jakartazoone, @mood.jakarta, @jkt.genz, @jakartazoone',
  reach: '~7M',
  reachValue: 7,
  avgER: 'low',
  avgERValue: -1,
  avgLikes: '~535',
  avgLikesValue: 535,
  contentType: 'Reel/Carousel'
}, {
  brandName: 'BRI (BRI Peduli)',
  productService: 'CSR — solar energy & karhutla water pumps',
  category: 'CSR/Banking',
  posts: 2,
  accountsUsed: '@kumparancom',
  reach: '~3M',
  reachValue: 3,
  avgER: 'low',
  avgERValue: -1,
  avgLikes: '~63',
  avgLikesValue: 63,
  contentType: 'Carousel/Image'
}, {
  brandName: 'Fitbar x ALD1',
  productService: 'Fit Alarm pop-up Blok M (K-pop event)',
  category: 'Snack/Event',
  posts: 2,
  accountsUsed: '@narasi.tv, @officialkvibes',
  reach: '~3M',
  reachValue: 3,
  avgER: 'low',
  avgERValue: -1,
  avgLikes: '~1,435',
  avgLikesValue: 1435,
  contentType: 'Reel/Carousel'
}, {
  brandName: 'Toyota Indonesia',
  productService: 'Toyota Space hybrid & new EV teaser',
  category: 'Automotive',
  posts: 2,
  accountsUsed: '@jktgo, @kumparancom',
  reach: '~5M',
  reachValue: 5,
  avgER: 'low',
  avgERValue: -1,
  avgLikes: '~683',
  avgLikesValue: 683,
  contentType: 'Reel/Carousel'
}, {
  brandName: 'Class Program',
  productService: 'Bimbingan skripsi & olah data (education)',
  category: 'Education',
  posts: 4,
  accountsUsed: '@zonamahasiswa.id',
  reach: '~2M',
  reachValue: 2,
  avgER: 'low',
  avgERValue: -1,
  avgLikes: 'hidden',
  avgLikesValue: -1,
  contentType: 'Reel'
}, {
  brandName: 'Samsung x Blibli',
  productService: 'Galaxy Watch rental & Galaxy promo at JRF',
  category: 'Tech/Gadget',
  posts: 2,
  accountsUsed: '@jktgo, @jakartazoone',
  reach: '~5M',
  reachValue: 5,
  avgER: 'low',
  avgERValue: -1,
  avgLikes: '~670',
  avgLikesValue: 670,
  contentType: 'Reel'
}, {
  brandName: 'Asuransi Astra (Garda Oto)',
  productService: 'myGarda app (insurance)',
  category: 'Insurance/Fintech',
  posts: 1,
  accountsUsed: '@kumparancom',
  reach: '~3M',
  reachValue: 3,
  avgER: '0.00%',
  avgERValue: 0,
  avgLikes: '15',
  avgLikesValue: 15,
  contentType: 'Carousel'
}, {
  brandName: 'Indomaret',
  productService: 'JSM discount promo',
  category: 'Retail',
  posts: 1,
  accountsUsed: '@giladiskonn',
  reach: '~2M',
  reachValue: 2,
  avgER: '0.04%',
  avgERValue: 0.04,
  avgLikes: '787',
  avgLikesValue: 787,
  contentType: 'Carousel'
}, {
  brandName: 'Uniqlo Indonesia',
  productService: 'Special price apparel',
  category: 'Fashion/Retail',
  posts: 1,
  accountsUsed: '@giladiskonn',
  reach: '~2M',
  reachValue: 2,
  avgER: '0.02%',
  avgERValue: 0.02,
  avgLikes: '473',
  avgLikesValue: 473,
  contentType: 'Carousel'
}, {
  brandName: 'Bank Mandiri',
  productService: 'Signature Bazaar event',
  category: 'Banking/Event',
  posts: 1,
  accountsUsed: '@giladiskonn',
  reach: '~2M',
  reachValue: 2,
  avgER: '0.00%',
  avgERValue: 0,
  avgLikes: '62',
  avgLikesValue: 62,
  contentType: 'Reel'
}, {
  brandName: 'Burger King Indonesia',
  productService: 'Boss Whopper (limited burger)',
  category: 'F&B',
  posts: 1,
  accountsUsed: '@giladiskonn',
  reach: '~2M',
  reachValue: 2,
  avgER: '0.00%',
  avgERValue: 0,
  avgLikes: '33',
  avgLikesValue: 33,
  contentType: 'Image'
}, {
  brandName: 'Spotify Premium',
  productService: 'OVO cashback 50% promo',
  category: 'Music Streaming',
  posts: 1,
  accountsUsed: '@abouthetic',
  reach: '~3M',
  reachValue: 3,
  avgER: 'hidden',
  avgERValue: -1,
  avgLikes: 'hidden',
  avgLikesValue: -1,
  contentType: 'Carousel'
}, {
  brandName: 'Indosat IM3',
  productService: 'Pesta Hadiah IMPoin 2026 (telco promo)',
  category: 'Telco',
  posts: 1,
  accountsUsed: '@abouthetic',
  reach: '~3M',
  reachValue: 3,
  avgER: 'hidden',
  avgERValue: -1,
  avgLikes: 'hidden',
  avgLikesValue: -1,
  contentType: 'Reel'
}, {
  brandName: 'Trimegah Sekuritas',
  productService: 'Reksa Dana giveaway Rp2.5jt',
  category: 'Investment',
  posts: 1,
  accountsUsed: '@officialkvibes',
  reach: '~1M',
  reachValue: 1,
  avgER: '0.02%',
  avgERValue: 0.02,
  avgLikes: '131',
  avgLikesValue: 131,
  contentType: 'Image'
}, {
  brandName: 'ASUS',
  productService: 'ProArt RTX Spark (creator laptop)',
  category: 'Tech/Gadget',
  posts: 1,
  accountsUsed: '@mood.jakarta',
  reach: '~1M',
  reachValue: 1,
  avgER: 'hidden',
  avgERValue: -1,
  avgLikes: 'hidden',
  avgLikesValue: -1,
  contentType: 'Reel'
}, {
  brandName: 'Pegadaian (Tring!)',
  productService: 'Nabung Emas Rp10rb (investment app)',
  category: 'Fintech',
  posts: 1,
  accountsUsed: '@ohmeygatt',
  reach: '~2M',
  reachValue: 2,
  avgER: 'hidden',
  avgERValue: -1,
  avgLikes: 'hidden',
  avgLikesValue: -1,
  contentType: 'Carousel'
}, {
  brandName: 'Caffino',
  productService: 'Ready-to-drink coffee',
  category: 'Beverage',
  posts: 1,
  accountsUsed: '@narasi.tv',
  reach: '~2M',
  reachValue: 2,
  avgER: '0.00%',
  avgERValue: 0,
  avgLikes: '~34',
  avgLikesValue: 34,
  contentType: 'Carousel'
}, {
  brandName: 'InJourney',
  productService: 'Mandalika KEK tourism development',
  category: 'Tourism',
  posts: 1,
  accountsUsed: '@gnfi',
  reach: '~1M',
  reachValue: 1,
  avgER: '0.46%',
  avgERValue: 0.46,
  avgLikes: '4,301',
  avgLikesValue: 4301,
  contentType: 'Carousel'
}, {
  brandName: 'Garuda Indonesia (GarudaMiles)',
  productService: 'Loyalty program – Frequent Traveler Awards',
  category: 'Airline',
  posts: 1,
  accountsUsed: '@gnfi',
  reach: '~1M',
  reachValue: 1,
  avgER: '0.33%',
  avgERValue: 0.33,
  avgLikes: '3,131',
  avgLikesValue: 3131,
  contentType: 'Carousel'
}, {
  brandName: 'PB Djarum',
  productService: 'Badminton athletes achievement (BWF World Junior)',
  category: 'Sports',
  posts: 1,
  accountsUsed: '@kumparancom',
  reach: '~3M',
  reachValue: 3,
  avgER: '0.00%',
  avgERValue: 0,
  avgLikes: '67',
  avgLikesValue: 67,
  contentType: 'Carousel'
}, {
  brandName: 'Mom Uung',
  productService: 'M2 Pro Breast Pump',
  category: 'Baby/Health',
  posts: 1,
  accountsUsed: '@shiftmedia.id',
  reach: '~2M',
  reachValue: 2,
  avgER: 'hidden',
  avgERValue: -1,
  avgLikes: 'hidden',
  avgLikesValue: -1,
  contentType: 'Carousel'
}, {
  brandName: 'Summarecon Mall',
  productService: 'Summarecon Expo 2026',
  category: 'Retail/Event',
  posts: 1,
  accountsUsed: '@jakartazoone',
  reach: '~3M',
  reachValue: 3,
  avgER: '0.00%',
  avgERValue: 0,
  avgLikes: '19',
  avgLikesValue: 19,
  contentType: 'Reel'
}, {
  brandName: 'AZKO',
  productService: '31st anniversary promo (home & hardware)',
  category: 'Retail',
  posts: 1,
  accountsUsed: '@jakartazoone',
  reach: '~3M',
  reachValue: 3,
  avgER: '0.00%',
  avgERValue: 0,
  avgLikes: '7',
  avgLikesValue: 7,
  contentType: 'Carousel'
}, {
  brandName: 'Partai NasDem',
  productService: 'Ruang Teduh Ibu political event',
  category: 'Political',
  posts: 1,
  accountsUsed: '@infojakarta30',
  reach: '~1M',
  reachValue: 1,
  avgER: '0.01%',
  avgERValue: 0.01,
  avgLikes: '95',
  avgLikesValue: 95,
  contentType: 'Reel'
}, {
  brandName: 'Kuruu.co x Dalang Pelo',
  productService: 'Dapel x Kuruu apparel collab',
  category: 'Apparel',
  posts: 1,
  accountsUsed: '@dalang.pelo',
  reach: '~3M',
  reachValue: 3,
  avgER: '0.11%',
  avgERValue: 0.11,
  avgLikes: '3,012',
  avgLikesValue: 3012,
  contentType: 'Reel'
}, {
  brandName: 'Starting Lane',
  productService: 'Running shoes Buy 1 Get 1',
  category: 'Sports/Footwear',
  posts: 1,
  accountsUsed: '@giladiskonn',
  reach: '~2M',
  reachValue: 2,
  avgER: '0.11%',
  avgERValue: 0.11,
  avgLikes: '2,088',
  avgLikesValue: 2088,
  contentType: 'Carousel'
}, {
  brandName: 'Wingstop Indonesia',
  productService: 'Value meal promo',
  category: 'F&B',
  posts: 1,
  accountsUsed: '@giladiskonn',
  reach: '~2M',
  reachValue: 2,
  avgER: '0.00%',
  avgERValue: 0,
  avgLikes: '63',
  avgLikesValue: 63,
  contentType: 'Reel'
}, {
  brandName: 'Lock&Lock Indonesia',
  productService: 'Tumbler promo 70% off',
  category: 'Kitchenware',
  posts: 1,
  accountsUsed: '@giladiskonn',
  reach: '~2M',
  reachValue: 2,
  avgER: '0.04%',
  avgERValue: 0.04,
  avgLikes: '846',
  avgLikesValue: 846,
  contentType: 'Carousel'
}, {
  brandName: 'Kota Kasablanka',
  productService: 'Faboolous Halloween + Harry Potter pop-up',
  category: 'Mall/Event',
  posts: 1,
  accountsUsed: '@giladiskonn',
  reach: '~2M',
  reachValue: 2,
  avgER: '0.01%',
  avgERValue: 0.01,
  avgLikes: '253',
  avgLikesValue: 253,
  contentType: 'Reel'
}, {
  brandName: 'ITC BSD',
  productService: 'Gadget & IT area tenant showcase',
  category: 'Retail/Event',
  posts: 1,
  accountsUsed: '@giladiskonn',
  reach: '~2M',
  reachValue: 2,
  avgER: '0.07%',
  avgERValue: 0.07,
  avgLikes: '1,472',
  avgLikesValue: 1472,
  contentType: 'Reel'
}, {
  brandName: 'Bakso Gacoan',
  productService: 'Bakso chain, Bandung promo',
  category: 'F&B',
  posts: 1,
  accountsUsed: '@mood.jakarta',
  reach: '~1M',
  reachValue: 1,
  avgER: 'hidden',
  avgERValue: -1,
  avgLikes: 'hidden',
  avgLikesValue: -1,
  contentType: 'Reel'
}, {
  brandName: 'Siti si Vampir (film)',
  productService: 'Film promo, B1G1 cinema',
  category: 'Entertainment',
  posts: 1,
  accountsUsed: '@mood.jakarta',
  reach: '~1M',
  reachValue: 1,
  avgER: 'hidden',
  avgERValue: -1,
  avgLikes: 'hidden',
  avgLikesValue: -1,
  contentType: 'Reel'
}, {
  brandName: 'Gesrek Festival',
  productService: 'Music festival tickets (50+ lineup)',
  category: 'Entertainment',
  posts: 1,
  accountsUsed: '@ohmeygatt',
  reach: '~2M',
  reachValue: 2,
  avgER: 'hidden',
  avgERValue: -1,
  avgLikes: 'hidden',
  avgLikesValue: -1,
  contentType: 'Carousel'
}, {
  brandName: 'iCar V25',
  productService: 'EV car review',
  category: 'Automotive',
  posts: 1,
  accountsUsed: '@kumparancom',
  reach: '~3M',
  reachValue: 3,
  avgER: '0.00%',
  avgERValue: 0,
  avgLikes: '110',
  avgLikesValue: 110,
  contentType: 'Reel'
}, {
  brandName: 'WCCE Weekland',
  productService: 'Creative economy conference at SCBD Park',
  category: 'Event',
  posts: 1,
  accountsUsed: '@infipop.id',
  reach: '~3M',
  reachValue: 3,
  avgER: '0.03%',
  avgERValue: 0.03,
  avgLikes: '1,041',
  avgLikesValue: 1041,
  contentType: 'Carousel'
}];
const brandCategoryBreakdown: BrandCategoryDatum[] = [{
  name: 'F&B / Restaurants',
  count: 28,
  color: '#a855f7'
}, {
  name: 'Events / Activations',
  count: 9,
  color: '#22d3ee'
}, {
  name: 'Tech & Gadgets',
  count: 5,
  color: '#818cf8'
}, {
  name: 'Fashion & Retail',
  count: 5,
  color: '#14b8a6'
}, {
  name: 'Finance & Banking',
  count: 6,
  color: '#ec4899'
}, {
  name: 'Sports & Fitness',
  count: 4,
  color: '#f59e0b'
}, {
  name: 'Mobility & Services',
  count: 3,
  color: '#fb7185'
}, {
  name: 'Entertainment',
  count: 3,
  color: '#06b6d4'
}, {
  name: 'Other',
  count: 5,
  color: '#a3e635'
}];
const multiAccountCampaigns: MultiAccountCampaign[] = [{
  brandName: 'Pop Mie × Pokémon',
  product: 'The Taste Adventure event',
  accounts: [{
    handle: '@abouthetic'
  }, {
    handle: '@jktgo'
  }, {
    handle: '@jkt.do'
  }],
  reach: '~8M reach',
  posts: 3,
  accent: '#a855f7'
}, {
  brandName: 'Green SM',
  product: 'Electric bike driver recruitment',
  accounts: [{
    handle: '@jakartazoone'
  }, {
    handle: '@mood.jakarta'
  }, {
    handle: '@jkt.genz'
  }],
  reach: '~7M reach',
  posts: 4,
  accent: '#22d3ee',
  note: 'Also appeared on @jakartazoone carousel'
}, {
  brandName: 'Bank Syariah Indonesia',
  product: 'BSI International Expo 2026',
  accounts: [{
    handle: '@ussfeeds'
  }, {
    handle: '@jakartazoone'
  }, {
    handle: '@kumparancom'
  }],
  reach: '~8M reach',
  posts: 3,
  accent: '#818cf8'
}, {
  brandName: 'Jakarta Running Festival (Adidas × Corkcicle)',
  product: 'Official JRF merch on Shopee',
  accounts: [{
    handle: '@folkative'
  }, {
    handle: '@abouthetic'
  }],
  reach: '~10M reach',
  posts: 2,
  accent: '#14b8a6'
}, {
  brandName: 'Fitbar × ALD1',
  product: 'Fit Alarm K-pop pop-up Blok M',
  accounts: [{
    handle: '@narasi.tv'
  }, {
    handle: '@officialkvibes'
  }],
  reach: '~3M reach',
  posts: 2,
  accent: '#ec4899'
}, {
  brandName: 'Le Minerale',
  product: 'Running Squad (mineral water)',
  accounts: [{
    handle: '@infipop.id'
  }, {
    handle: '@kumparancom'
  }],
  reach: '~4M reach',
  posts: 2,
  accent: '#f59e0b'
}, {
  brandName: 'Toyota Indonesia',
  product: 'Space hybrid & EV teaser',
  accounts: [{
    handle: '@jktgo'
  }, {
    handle: '@kumparancom'
  }],
  reach: '~5M reach',
  posts: 2,
  accent: '#fb7185'
}];
const topBrandReachData: TopReachBrand[] = [{
  brandName: 'Jakarta Running Festival',
  category: 'Sports Event',
  posts: 2,
  accounts: '@folkative + @abouthetic',
  reach: '~10M',
  reachValue: 10,
  product: 'Official JRF merch on Shopee',
  color: '#14b8a6'
}, {
  brandName: 'Pop Mie x Pokémon',
  category: 'F&B/Event',
  posts: 3,
  accounts: '@abouthetic + @jktgo + @jkt.do',
  reach: '~8M',
  reachValue: 8,
  product: 'The Taste Adventure event',
  color: '#a855f7'
}, {
  brandName: 'Bank Syariah Indonesia',
  category: 'Banking/Event',
  posts: 3,
  accounts: '@ussfeeds + @jakartazoone + @kumparancom',
  reach: '~8M',
  reachValue: 8,
  product: 'BSI International Expo 2026',
  color: '#818cf8'
}, {
  brandName: 'Green SM',
  category: 'Mobility/Job',
  posts: 4,
  accounts: '@jakartazoone + @mood.jakarta + @jkt.genz',
  reach: '~7M',
  reachValue: 7,
  product: 'Driver recruitment (electric mobility)',
  color: '#22d3ee'
}, {
  brandName: 'Samsung x Blibli',
  category: 'Tech/Gadget',
  posts: 2,
  accounts: '@jktgo + @jakartazoone',
  reach: '~5M',
  reachValue: 5,
  product: 'Galaxy Watch rental & Galaxy promo at JRF',
  color: '#818cf8'
}, {
  brandName: 'Toyota Indonesia',
  category: 'Automotive',
  posts: 2,
  accounts: '@jktgo + @kumparancom',
  reach: '~5M',
  reachValue: 5,
  product: 'Toyota Space hybrid & new EV teaser',
  color: '#fb7185'
}, {
  brandName: 'Le Minerale',
  category: 'Beverage',
  posts: 2,
  accounts: '@infipop.id + @kumparancom',
  reach: '~4M',
  reachValue: 4,
  product: 'Running Squad / mineral water',
  color: '#a855f7'
}, {
  brandName: 'Class Program',
  category: 'Education',
  posts: 4,
  accounts: '@zonamahasiswa.id',
  reach: '~2M',
  reachValue: 2,
  product: 'Bimbingan skripsi & olah data',
  color: '#22d3ee'
}, {
  brandName: 'Fitbar x ALD1',
  category: 'Snack/Event',
  posts: 2,
  accounts: '@narasi.tv + @officialkvibes',
  reach: '~3M',
  reachValue: 3,
  product: 'Fit Alarm K-pop pop-up Blok M',
  color: '#ec4899'
}, {
  brandName: 'Pegadaian / Tring!',
  category: 'Fintech',
  posts: 1,
  accounts: '@ohmeygatt',
  reach: '~2M',
  reachValue: 2,
  product: 'Nabung Emas Rp10rb',
  color: '#14b8a6'
}, {
  brandName: 'Trimegah Sekuritas',
  category: 'Investment',
  posts: 1,
  accounts: '@officialkvibes',
  reach: '~1M',
  reachValue: 1,
  product: 'Reksa Dana giveaway Rp2.5jt',
  color: '#f59e0b'
}, {
  brandName: 'InJourney (Mandalika)',
  category: 'Tourism',
  posts: 1,
  accounts: '@gnfi',
  reach: '~1M',
  reachValue: 1,
  product: 'Mandalika KEK tourism development',
  color: '#a3e635'
}];
const brandInsights: BrandInsight[] = [{
  title: '🍔 @jktfoodbang dominates sponsored content',
  text: '~130 of 148 posts are paid F&B brand reviews, making it the dataset’s #1 monetized account by volume'
}, {
  title: '📢 Pop Mie × Pokémon ran the widest coordinated campaign',
  text: 'Hitting 3 accounts (@abouthetic, @jktgo, @jkt.do) for ~8M combined reach in one weekend activation'
}, {
  title: '🌟 InJourney (Mandalika) achieved the highest avg likes',
  text: '4,301 avg likes on @gnfi among brands with real engagement data — outperforming most F&B sponsors'
}];
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
const contentData: ContentDatum[] = [{
  name: 'Reel',
  posts: 325,
  likes: 2276,
  er: 0.12,
  views: 120043
}, {
  name: 'Carousel',
  posts: 229,
  likes: 7779,
  er: 0.32
}, {
  name: 'Single Image',
  posts: 84,
  likes: 7786,
  er: 0.32
}];
const categoryData = [{
  name: 'Food & Culinary',
  posts: 164,
  likes: 375,
  er: 0.04
}, {
  name: 'Entertainment & Celebrity',
  posts: 83,
  likes: 8885,
  er: 0.35
}, {
  name: 'Disaster & Environment',
  posts: 49,
  likes: 12581,
  er: 0.45
}, {
  name: 'Politics & Government',
  posts: 38,
  likes: 6814,
  er: 0.31
}, {
  name: 'News & Current Affairs',
  posts: 30,
  likes: 4531,
  er: 0.26
}, {
  name: 'Comedy',
  posts: 29,
  likes: 4802,
  er: 0.24
}, {
  name: 'Sports',
  posts: 28,
  likes: 5970,
  er: 0.32
}, {
  name: 'Social & Humanity',
  posts: 27,
  likes: 12472,
  er: 0.4
}, {
  name: 'Education & Career',
  posts: 25,
  likes: 1707,
  er: 0.13
}, {
  name: 'Economy & Finance',
  posts: 24,
  likes: 2168,
  er: 0.16
}];
const triggerData = [{
  name: 'Curiosity',
  posts: 251,
  likes: 3707,
  er: 0.16
}, {
  name: 'Utility',
  posts: 106,
  likes: 2490,
  er: 0.12
}, {
  name: 'Empathy',
  posts: 69,
  likes: 12052,
  er: 0.42
}, {
  name: 'Outrage',
  posts: 60,
  likes: 6624,
  er: 0.33
}, {
  name: 'Aspiration',
  posts: 43,
  likes: 3352,
  er: 0.21
}, {
  name: 'Humor',
  posts: 40,
  likes: 2971,
  er: 0.17
}, {
  name: 'Novelty',
  posts: 35,
  likes: 6799,
  er: 0.46
}, {
  name: 'Relatability',
  posts: 22,
  likes: 6282,
  er: 0.29
}];
const shareData = [{
  name: 'Practical Value',
  value: 263
}, {
  name: 'Debate/Controversy',
  value: 111
}, {
  name: 'Identity Signaling',
  value: 93
}, {
  name: 'News Value',
  value: 60
}, {
  name: 'Emotional Resonance',
  value: 56
}, {
  name: 'Humor/Entertainment',
  value: 38
}, {
  name: 'Relatability',
  value: 17
}];
const hourData = [10, 20, 35, 61, 69, 52, 53, 43, 47, 45, 52, 55, 38, 30, 14, 7];
const accounts: Account[] = [{
  account: 'jktfoodbang',
  posts: 148,
  followers: '1M',
  likes: 339,
  er: 0.04
}, {
  account: 'kumparancom',
  posts: 94,
  followers: '3M',
  likes: 3722,
  er: 0.14
}, {
  account: 'officialkvibes',
  posts: 36,
  followers: '1M',
  likes: 3851,
  er: 0.4
}, {
  account: 'gnfi',
  posts: 30,
  followers: '1M',
  likes: 1561,
  er: 0.2
}, {
  account: 'indozone.id',
  posts: 28,
  followers: '5M',
  likes: 8559,
  er: 0.18
}, {
  account: 'lambe_turah',
  posts: 24,
  followers: '12M',
  likes: 22669,
  er: 0.21
}, {
  account: 'jktgo',
  posts: 22,
  followers: '2M',
  likes: 2042,
  er: 0.11
}, {
  account: 'infipop.id',
  posts: 19,
  followers: '3M',
  likes: 5661,
  er: 0.21
}, {
  account: 'mood.jakarta',
  posts: 19,
  followers: '1M',
  likes: 2889,
  er: 0.74
}, {
  account: 'giladiskonn',
  posts: 17,
  followers: '2M',
  likes: 607,
  er: 0.03
}];
const posts: Post[] = [{
  rank: 1,
  account: 'folkative',
  type: 'Carousel',
  category: 'Disaster & Environment',
  likes: 157219,
  comments: 1329,
  er: 2.38,
  caption: 'European football clubs show support for Indonesia'
}, {
  rank: 2,
  account: 'folkative',
  type: 'Single Image',
  category: 'Politics & Government',
  likes: 128341,
  comments: 1601,
  er: 1.9,
  caption: 'Jakarta Governor Pramono Anung announces new plan'
}, {
  rank: 3,
  account: 'folkative',
  type: 'Carousel',
  category: 'Social & Humanity',
  likes: 124236,
  comments: 952,
  er: 1.81,
  caption: '61-year-old Indonesian found after six days missing at sea'
}, {
  rank: 4,
  account: 'lambe_turah',
  type: 'Carousel',
  category: 'Entertainment & Celebrity',
  likes: 112999,
  comments: 7155,
  er: 1.09,
  caption: 'Kabar terbaru selebritas Indonesia yang ramai dibicarakan'
}, {
  rank: 5,
  account: 'folkative',
  type: 'Single Image',
  category: 'Disaster & Environment',
  likes: 106262,
  comments: 588,
  er: 1.61,
  caption: 'Forest fire victim Pak Suraji'
}, {
  rank: 6,
  account: 'lambe_turah',
  type: 'Carousel',
  category: 'Entertainment & Celebrity',
  likes: 90927,
  comments: 6442,
  er: 0.84,
  caption: 'Momen viral terbaru dari dunia hiburan'
}, {
  rank: 7,
  account: 'jakarta.keras',
  type: 'Single Image',
  category: 'Crime & Law',
  likes: 77058,
  comments: 1176,
  er: 1.33,
  caption: 'Kabar Jakarta hari ini yang mengundang perhatian'
}];
const insights = [['📊', 'Carousel & single images earn ~3.4× the avg likes of Reels'], ['🌱', 'Organic posts get 6.4× the engagement rate of sponsored posts'], ['💡', 'Empathy and Novelty triggers drive the highest ER (0.42–0.46%) while Curiosity is most common'], ['🍜', 'Food & Culinary is the largest category (164 posts, mostly @jktfoodbang) but has the lowest ER (0.04%)'], ['⏰', 'Peak posting window is 10:00–12:00 WIB']];
const sponsoredInsights = ['Organic posts earn 16.7x more avg likes than sponsored posts (7,429 vs 445)', 'Organic ER is 6.4x higher than sponsored (0.32% vs 0.05%)', 'Sponsored posts make up 35.1% of viral posts but drive only a small fraction of engagement'];
const brandAccounts: BrandAccount[] = [{
  account: 'jktfoodbang',
  followers: '1M',
  followersValue: 1,
  sponsoredPosts: 130,
  productType: 'Food & Beverage',
  brandNames: 'Dapur Cokelat, Indomie, Moggumung KBBQ, Jumbo Seafood, AEON Mall BSD, CHAGEE, Bango, Flash Coffee, Fore Coffee + 120 more F&B brands'
}, {
  account: 'jktgo',
  followers: '2M',
  followersValue: 2,
  sponsoredPosts: 16,
  productType: 'Mixed',
  brandNames: 'JKTGO App, Pop Mie × Pokémon, Samsung × Blibli, Toyota Indonesia, JBL, Miniso, Jotun, Dekkson, Black+Decker, Leben + 6 more'
}, {
  account: 'giladiskonn',
  followers: '2M',
  followersValue: 2,
  sponsoredPosts: 14,
  productType: 'Mixed',
  brandNames: 'Uniqlo, Indomaret, Bank Mandiri, Burger King, Starting Lane, Wingstop, Lock&Lock, Kota Kasablanka, ITC BSD + 5 more'
}, {
  account: 'kumparancom',
  followers: '3M',
  followersValue: 3,
  sponsoredPosts: 7,
  productType: 'Mixed',
  brandNames: 'Asuransi Astra (Garda Oto), Le Minerale, BRI Peduli, Toyota Indonesia, PB Djarum, iCar V25, Bank Syariah Indonesia'
}, {
  account: 'jakartazoone',
  followers: '3M',
  followersValue: 3,
  sponsoredPosts: 5,
  productType: 'Mixed',
  brandNames: 'Green SM, Samsung Galaxy Tab S12, Bank Syariah Indonesia, AZKO, Summarecon Mall'
}, {
  account: 'zonamahasiswa.id',
  followers: '2M',
  followersValue: 2,
  sponsoredPosts: 5,
  productType: 'Mixed',
  brandNames: 'Class Program (bimbingan skripsi), Cititex (custom sablon)'
}, {
  account: 'abouthetic',
  followers: '3M',
  followersValue: 3,
  sponsoredPosts: 4,
  productType: 'Mixed',
  brandNames: 'Pop Mie × Pokémon, Spotify Premium, Jakarta Running Festival (Adidas/Corkcicle), Indosat IM3'
}, {
  account: 'mood.jakarta',
  followers: '1M',
  followersValue: 1,
  sponsoredPosts: 4,
  productType: 'Mixed',
  brandNames: 'ASUS ProArt RTX Spark, Green SM, Siti si Vampir (film), Bakso Gacoan'
}, {
  account: 'officialkvibes',
  followers: '1M',
  followersValue: 1,
  sponsoredPosts: 3,
  productType: 'Mixed',
  brandNames: 'Trimegah Sekuritas, Fitbar × ALD1, Hwang In Youp Fanmeeting'
}, {
  account: 'jkt.do',
  followers: '1M',
  followersValue: 1,
  sponsoredPosts: 3,
  productType: 'F&B',
  brandNames: 'Sei Deli Bakery, SushiMate, Pop Mie × Pokémon'
}, {
  account: 'narasi.tv',
  followers: '2M',
  followersValue: 2,
  sponsoredPosts: 2,
  productType: 'Mixed',
  brandNames: 'Caffino (RTD coffee), Fitbar × ALD1'
}, {
  account: 'infipop.id',
  followers: '3M',
  followersValue: 3,
  sponsoredPosts: 2,
  productType: 'Mixed',
  brandNames: 'Le Minerale Running Squad, WCCE Weekland'
}, {
  account: 'gnfi',
  followers: '1M',
  followersValue: 1,
  sponsoredPosts: 2,
  productType: 'Mixed',
  brandNames: 'InJourney (Mandalika KEK), Garuda Indonesia (GarudaMiles)'
}, {
  account: 'ohmeygatt',
  followers: '2M',
  followersValue: 2,
  sponsoredPosts: 2,
  productType: 'Mixed',
  brandNames: 'Pegadaian / Tring! (Nabung Emas), Gesrek Festival'
}, {
  account: 'folkative',
  followers: '7M',
  followersValue: 7,
  sponsoredPosts: 1,
  productType: 'Sports',
  brandNames: 'Jakarta Running Festival × Adidas × Corkcicle'
}];
const colors = ['#f97316', '#fb923c', '#f97316', '#fb923c', '#f97316', '#fb923c', '#f97316', '#fb923c'];
const postDates: Record<number, string> = {
  1: '24',
  2: '23',
  3: '23',
  4: '24',
  5: '22',
  6: '23',
  7: '23'
};
const dateCounts: Record<string, number> = {
  '22': 41,
  '23': 583,
  '24': 14
};
const typeCounts: Record<string, number> = {
  Reel: 325,
  Carousel: 229,
  'Single Image': 84
};
const categoryCounts: Record<string, number> = {
  Organic: 414,
  Sponsored: 224
};
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
const organicStats = {
  posts: 414,
  likes: 7429,
  er: 0.32,
  views: 227122
};
const sponsoredStats = {
  posts: 224,
  likes: 445,
  er: 0.05,
  views: 29391
};
const totalSponsorshipPosts = organicStats.posts + sponsoredStats.posts;
const organicShare = organicStats.posts / totalSponsorshipPosts * 100;
const sponsoredShare = sponsoredStats.posts / totalSponsorshipPosts * 100;
function SponsoredBarGroup({
  metric,
  setMetric
}: {
  metric: SponsoredMetric;
  setMetric: (value: SponsoredMetric) => void;
}) {
  const labels: Record<SponsoredMetric, string> = { likes: 'Avg likes', er: 'Avg ER', views: 'Avg views' };
  const formatValue = (value: number) => metric === 'er' ? `${value}%` : fmt(value);
  const option = useMemo(() => vBarOption({
    data: [{ name: 'Organic', value: organicStats[metric], color: theme.orange }, { name: 'Sponsored', value: sponsoredStats[metric], color: theme.blue }],
    format: formatValue,
    barMaxWidth: 72,
    tooltipText: i => `${i === 0 ? 'Organic' : 'Sponsored'} · ${labels[metric]}<br/><b style="font-family:${theme.mono}">${formatValue(i === 0 ? organicStats[metric] : sponsoredStats[metric])}</b>`,
  }), [metric]);
  return <EChart option={option} height={220} ariaLabel="Organic vs sponsored comparison bar chart" />;
}
function BrandTable({
  brands
}: {
  brands: string[];
}) {
  const [sortKey, setSortKey] = useState<BrandSortKey>('sponsoredPosts');
  const [direction, setDirection] = useState<Direction>('desc');
  const sorted = useMemo(() => [...brandAccounts].filter(row => brands.length === 0 || brandMatch(row.brandNames, brands)).sort((a, b) => {
    const left = sortKey === 'followers' ? a.followersValue : sortKey === 'account' ? a.account : a.sponsoredPosts;
    const right = sortKey === 'followers' ? b.followersValue : sortKey === 'account' ? b.account : b.sponsoredPosts;
    const result = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right));
    return direction === 'asc' ? result : -result;
  }), [sortKey, direction, brands]);
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
  const likesDelta = (organicStats.likes / sponsoredStats.likes).toFixed(1);
  const erDelta = (organicStats.er / sponsoredStats.er).toFixed(1);
  const viewsDelta = (organicStats.views / sponsoredStats.views).toFixed(1);
  return <section>
    <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
      {[{
        label: 'Posts',
        organic: fmt(organicStats.posts),
        sponsored: fmt(sponsoredStats.posts),
        delta: `Organic ${(organicStats.posts / sponsoredStats.posts).toFixed(1)}x more posts`
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
            <EChart height={140} width={140} ariaLabel="Organic and sponsored post volume split" option={donutOption({ data: [{ name: 'Organic', value: organicStats.posts, color: theme.orange }, { name: 'Sponsored', value: sponsoredStats.posts, color: theme.blue }], centerValue: '638', centerLabel: 'total posts', format: v => `${fmt(v)} posts` })} />
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
  const [sortKey, setSortKey] = useState<BrandPerformanceSortKey>('posts');
  const [direction, setDirection] = useState<Direction>('desc');
  const sortedBrandRows = useMemo(() => [...brandPerformanceData].sort((a, b) => {
    const left = sortKey === 'reach' ? a.reachValue : sortKey === 'avgER' ? a.avgERValue : sortKey === 'avgLikes' ? a.avgLikesValue : a[sortKey];
    const right = sortKey === 'reach' ? b.reachValue : sortKey === 'avgER' ? b.avgERValue : sortKey === 'avgLikes' ? b.avgLikesValue : b[sortKey];
    const result = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right));
    return direction === 'asc' ? result : -result;
  }), [sortKey, direction]);
  const sortBrandRows = (key: BrandPerformanceSortKey) => {
    if (sortKey === key) setDirection(direction === 'asc' ? 'desc' : 'asc');else {
      setSortKey(key);
      setDirection('desc');
    }
  };
  const brandDonut = useMemo(() => donutOption({ data: brandCategoryBreakdown.map(item => ({ name: item.name, value: item.count, color: item.color })), centerValue: '68', centerLabel: 'brand tags', format: v => `${v} brand tags` }), []);
  const reachOption = useMemo(() => hBarOption({
    data: topBrandReachData.map(item => ({ name: item.brandName, value: item.reachValue, color: item.color, label: item.reach })),
    format: v => `~${v}M`,
    labelWidth: 190,
    valueWidth: 60,
    tooltipText: i => { const item = topBrandReachData[i]; return `<b>${item.brandName}</b> <span style="color:${theme.subtle}">· ${item.category}</span><br/>${item.posts} posts · ${item.accounts}<br/><b style="font-family:${theme.mono}">${item.reach}</b> est. reach · ${item.product}`; },
  }), []);
  return <section className="brand-analytics-view">
    <section className="panel brand-table-panel">
      <div className="brand-dashboard-heading">
        <div>
          <p className="eyebrow">Brand performance</p>
          <h2>Sponsored Posts by Brand</h2>
          <p>Brand attribution from monetization_signals.product_mentioned.name · Oct 22–24 2026</p>
        </div>
        <span className="brand-count-badge">52 attributed brands</span>
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
  const overviewDonut = useMemo(() => donutOption({ data: [{ name: 'Organic', value: 414, color: theme.orange }, { name: 'Sponsored', value: 224, color: theme.blue }], centerValue: '638', centerLabel: 'posts', format: v => `${fmt(v)} posts` }), []);
  const shareOption = useMemo(() => hBarOption({ data: shareData.map((item, index) => ({ name: item.name, value: item.value, color: colors[index % colors.length] })), format: v => fmt(v), labelWidth: 150, tooltipText: i => `${shareData[i].name}<br/><b style="font-family:${theme.mono}">${shareData[i].value}</b> posts` }), []);
  const hourLabels = hourData.map((_, index) => String(7 + index).padStart(2, '0'));
  const hourOption = useMemo(() => lineOption({ labels: hourLabels, values: hourData, peakIndex: hourData.indexOf(Math.max(...hourData)), tooltipText: i => `${hourLabels[i]}:00 WIB<br/><b style="font-family:${theme.mono}">${hourData[i]}</b> posts` }), []);
  const [dates, setDates] = useState<string[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [postCategory, setPostCategory] = useState<PostCategory>('All');
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
  const dateShare = dates.length === 0 ? 1 : dates.reduce((s, d) => s + dateCounts[d], 0) / 638;
  const typeShare = filter === 'All' ? 1 : typeCounts[filter] / 638;
  const catShare = postCategory === 'All' ? 1 : categoryCounts[postCategory] / 638;
  const brandPosts = brands.length === 0 ? 638 : brands.reduce((s, b) => s + (brandPerformanceData.find(r => brandMatch(r.brandName, [b]))?.posts ?? 1), 0);
  const shownCount = Math.round(Math.min(638, brandPosts) * dateShare * typeShare * (brands.length ? 1 : catShare));
  const ratio = shownCount / 638;
  const scaleKpi = (v: string) => v.includes('%') ? v : fmt(Math.round(Number(v.replace(/,/g, '')) * ratio));
  const filteredPosts = posts.filter(post => (filter === 'All' || post.type === filter) && (dates.length === 0 || dates.includes(postDates[post.rank])) && postCategory !== 'Sponsored' && brands.length === 0);
  const sortedAccounts = useMemo(() => [...accounts].sort((a, b) => {
    const left = a[sortKey];
    const right = b[sortKey];
    const result = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right));
    return direction === 'asc' ? result : -result;
  }), [sortKey, direction]);
  const sortAccounts = (key: SortKey) => {
    if (sortKey === key) setDirection(direction === 'asc' ? 'desc' : 'asc');else {
      setSortKey(key);
      setDirection('desc');
    }
  };
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
        <span className="theme-badge">22–24 Oct 2026 · 638 posts</span>
      </header>
      {activeTab === 'agent' ? <AgentChat /> : <>
      <FilterBar dates={dates} setDates={setDates} brands={brands} setBrands={setBrands} type={filter} setType={setFilter} category={postCategory} setCategory={changeCategory} shown={shownCount} onReset={resetFilters} />
      {activeTab === 'overview' && brands.length > 0 && <p className="mt-4 mb-0 inline-flex items-center gap-1.5 rounded-md border border-[#27272a] bg-[#18181b] px-2.5 py-1 text-[12px] text-zinc-400"><span className="w-1.5 h-1.5 rounded-full bg-orange-500" /><span>Filtered: {brands.join(', ')}</span></p>}
      {shownCount === 0 ? <section className="flex flex-col items-center gap-3 py-24 text-center"><p className="m-0 text-[13px] text-zinc-600">No posts match the selected filters</p><button className="filter-chip" onClick={resetFilters}>Reset</button></section> : null}
      <section className="kpi-grid">{[['Total Posts', String(shownCount), Activity, '', 'blue'], ['Total Likes', '3,175,046', Heart, '', 'orange'], ['Total Comments', '134,635', MessageCircle, '', 'orange'], ['Total Reposts', '153,110', Repeat2, '', 'orange'], ['Reel Views', '39,014,015', Eye, '325 reels', 'blue'], ['Avg ER by followers', '0.22%', Zap, 'median 0.06%', 'orange']].map(([label, value,, trend, tone]) => <article className={`kpi-card ${String(tone)}`} key={String(label)}><div className="kpi-label"><p>{String(label)}</p><Info size={12} className="info-icon" /></div><strong>{label === 'Total Posts' ? String(value) : scaleKpi(String(value))}</strong>{trend ? <span className="trend-chip">{String(trend)}</span> : null}</article>)}</section>
      {activeTab === 'brand' ? <BrandAnalyticsView brands={brands} /> : activeTab === 'sponsored' ? <SponsoredView brands={brands} /> : <section>
      <section className="charts-grid">
        <section className="panel content-performance"><div className="chart-head"><SectionHeading eyebrow="Format mix" title="Content Type Performance" /><div className="toggle-group"><Toggle value="posts" active={contentMetric} onClick={setContentMetric} /><Toggle value="likes" active={contentMetric} onClick={setContentMetric} /><Toggle value="er" active={contentMetric} onClick={setContentMetric} /></div></div><MiniBars data={contentData} metric={contentMetric} onHover={() => undefined} /><div className="legend-note"><span className="legend-dot purple" />Reel <span className="legend-dot cyan" />Carousel <span className="legend-dot indigo" />Single Image</div></section>
        <section className="panel organic-panel"><SectionHeading eyebrow="Distribution" title="Organic vs Sponsored" /><div className="organic-layout"><div className="donut-wrap"><EChart height={140} width={140} ariaLabel="Organic and sponsored post split" option={overviewDonut} /></div><div className="organic-stats"><div><span className="stat-name"><i className="dot purple" />Organic</span><strong>414 <small>posts</small></strong><p>7,429 avg likes · <b>0.32%</b> ER</p></div><div><span className="stat-name"><i className="dot cyan" />Sponsored</span><strong>224 <small>posts</small></strong><p>445 avg likes · <b>0.05%</b> ER</p></div></div></div><div className="views-compare"><span>Avg views</span><b>227,122 <em>organic</em></b><b>29,391 <em className="cyan-text">sponsored</em></b></div></section>
        <AnalyticsChart title="Viral Category Breakdown" eyebrow="Content taxonomy" data={categoryData} type="category" metric={categoryMetric} setMetric={setCategoryMetric} />
        <AnalyticsChart title="Primary Viral Trigger" eyebrow="Psychology" data={triggerData} type="trigger" metric={triggerMetric} setMetric={setTriggerMetric} />
        <section className="panel share-panel"><SectionHeading eyebrow="Sharing behavior" title="Share Driver Distribution" /><EChart option={shareOption} height={shareData.length * 30} ariaLabel="Share driver distribution bar chart" /></section>
        <section className="panel hours-panel"><SectionHeading eyebrow="Timing signal" title="Posting Hour Distribution (WIB)" action="Peak: 11:00" /><EChart option={hourOption} height={190} ariaLabel="Posting hour line chart" /></section>
      </section>
      <section className="lower-grid"><section className="panel accounts-panel"><SectionHeading eyebrow="Audience leaders" title="Top Accounts by Post Volume" action="10 accounts" /><div className="table-scroll"><table><thead><tr>{[['account', 'Account'], ['posts', 'Posts'], ['followers', 'Followers'], ['likes', 'Avg Likes'], ['er', 'Avg ER']].map(([key, label]) => <th key={key}><button onClick={() => sortAccounts(key as SortKey)}>{label}{sortKey === key && (direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}</button></th>)}</tr></thead><tbody>{sortedAccounts.map(account => <tr key={account.account}><td><span className="account-avatar">{account.account.slice(0, 1).toUpperCase()}</span>@{account.account}</td><td>{account.posts}</td><td>{account.followers}</td><td>{fmt(account.likes)}</td><td><span className={erClass(account.er)}>{account.er}%</span></td></tr>)}</tbody></table></div></section>
        <aside className="panel insights-panel"><SectionHeading eyebrow="What matters" title="Key Insights" /><ol>{insights.map(([icon, text], index) => <li key={text}><span className="insight-number">{index + 1}</span><span className="insight-icon">{icon}</span><p>{text}</p></li>)}</ol></aside></section>
      <section className="panel posts-panel"><div className="posts-heading"><SectionHeading eyebrow="Leaderboard" title="Top Posts by Likes" /></div>{filteredPosts.length === 0 ? <div className="flex flex-col items-center gap-3 py-10"><p className="m-0 text-[13px] text-zinc-600">No posts match the selected filters</p><button className="filter-chip" onClick={resetFilters}>Reset</button></div> : null}<div className="post-list">{filteredPosts.map(post => <article className="post-row" key={post.rank}><span className="rank-badge">{post.rank}</span><div className="post-main"><div className="post-meta"><strong>@{post.account}</strong><span className="type-badge">{post.type}</span><span className="category-badge">{post.category}</span></div><p>{post.caption}</p></div><div className="post-metric"><strong>{fmt(post.likes)}</strong><span>likes</span></div><div className="post-metric"><strong>{fmt(post.comments)}</strong><span>comments</span></div><div className="post-metric er-metric"><strong>{post.er}%</strong><span>ER</span></div><button className="more-button" aria-label={`More options for post ${post.rank}`}><MoreHorizontal size={18} /></button></article>)}</div></section>
      </section>}
      </>}
      {activeTab !== 'agent' && <footer className="footer-note"><span><Sparkles size={14} />Built for signal, not noise.</span><span>Data IG (HM) · Updated 24 Oct 2026</span></footer>}
    </div>
  </main>;
}