import { useState } from 'react';
import { Calendar, Check, ChevronDown, Database, LayoutGrid, Tag, X } from 'lucide-react';
export type PostType = 'All' | 'Reel' | 'Carousel' | 'Single Image';
export type PostCategory = 'All' | 'Organic' | 'Sponsored';
const BRAND_SOURCE = 'A5 Dining|AEON Mall BSD|Amanojaku|Antarasa|Arunalaut Seafood|Ask For Patty|Asuransi Astra (Garda Oto)|ASUS ProArt|AZKO|Baan Mook|Bakmi Tjap Makmur|Bakso Banjir|Bakso Gacoan|Bango Festival Jajanan|Bank Mandiri|Bank Syariah Indonesia|Baboy|Bee Cheng Hiang|Best Batch|Black Pearl Kelan Beach|Blok M Square|Brownie Lab|BRI Peduli|Brother John|Bubur Ayam Tjap|Burger King Indonesia|Caffino|Central Market PIK|CHAGEE|Cilok DPR|Class Program|Cobek Uleg Marlinda|Coco Made|Crystal Jade Bakehouse|Dapoer Nonik|Dapur Cokelat|Dekkson|Dudung Maman|Duree Gading Serpong|East Coast PIK|Ebiga|Eight N Treat|Filadelfia Sushi|Fish Streat|Flash Coffee|Fitbar x ALD1|Folkative x Suasanakopi|Fore Coffee|Fraser Driving Lounge|Fround|Garuda Indonesia (GarudaMiles)|Gesrek Festival|GoFood|Goffee Exquise|Grainsly|Green SM|Gurana at Dusk|Haidilao x Sunpride|Hanok|Himizu|Hoejan Rasa|Hog Hock|Humble Baker|Hwang In Youp Fanmeeting|Hwaro|iCar V25|Indosat IM3|Indomaret|Indomie|InJourney|ITC BSD|Jack n John x Kota Hainan|Jakarta Running Festival|JKTGO App|JBL Indonesia|Jonkira|Jordnara|Juicy Sally|Jumbo Seafood|Justus Steakhouse|Kampung Babi KBBQ|Keia Matcha x Zest Bowl|Kedai Caoan|Ko Mike Steak|Kota Kasablanka|Kuruu.co x Dalang Pelo|Lane Greek Yogurt Bar|Laris Manis Bakery|Lavela Greenlake|Leben|Ledrensya Cafe Patisserie|Le Minerale|Living World Alam Sutera|Lock&Lock Indonesia|Madame Kwok|Mall Alam Sutera|Merambah Rasa|Mie Ayam Comal|Mikku Brew Bite|Miniso Indonesia|MiX Store|Mom Uung|Moggumung KBBQ|Monohouse|Morning Sol|Naries Eatery|Nilagiri Resto|Nikugo|Novotel BSD|Oma Coffee Brewers|Omah Yung Ginah|Otak-otak Kerajinan|Palmers Bakery|Partai NasDem|PB Djarum|Pegadaian (Tring!)|Pesta Kebun|PIB Ujung Pandang|Pop Mie x Pokemon|Provence Bakery|Rahayu Kitchen|Ranch Market|Rindu Seoul|Roti Made|Samsung x Blibli|Secret Sushi|Sei Deli Bakery|Seesalt Gading Serpong|Shabu Shaburi & Kintan Buffet|Shabu Shabu Letasu|Singapolah|Singres Mosaic|Siti si Vampir|Spotify Premium|Starting Lane|Sukiyakirin|Summarecon Mall|Soto Babe Tito|SushiMate|Tahu Priangan|Taliwang Bali|Tangban|The Bay Social House|The Dream Lab MOI|Tiga Kawan Kopitiam|Tigo Sapilin|Toyota Indonesia|Trimegah Sekuritas|Umaqita|Uncle Lui|Uniqlo Indonesia|Urban Wagyu|Vovo Toys x TOMYTEC|Waki Signature|WCCE Weekland|Wingstop Indonesia|Yakitate Kalbi|Yakiniku Marumichi|Young Restaurant';
const brandOptions = BRAND_SOURCE.split('|').map(name => ({
  name
}));
const dateOptions = [{
  key: '22',
  label: '22 Oct'
}, {
  key: '23',
  label: '23 Oct'
}, {
  key: '24',
  label: '24 Oct'
}];
const typeOptions: {
  key: PostType;
}[] = [{
  key: 'All'
}, {
  key: 'Reel'
}, {
  key: 'Carousel'
}, {
  key: 'Single Image'
}];
const categoryOptions: {
  key: PostCategory;
}[] = [{
  key: 'All'
}, {
  key: 'Organic'
}, {
  key: 'Sponsored'
}];
const pill = 'inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-[12px] whitespace-nowrap cursor-pointer';
const off = 'bg-[#18181b] border-[#27272a] text-zinc-300 hover:border-[#3f3f46]';
const on = 'bg-[#f97316]/10 border-[#f97316]/40 text-orange-400';
const label = 'inline-flex items-center gap-1.5 text-[12px] text-zinc-500 mr-1';
type FilterBarProps = {
  dates: string[];
  setDates: (v: string[]) => void;
  brands: string[];
  setBrands: (v: string[]) => void;
  type: PostType;
  setType: (v: PostType) => void;
  category: PostCategory;
  setCategory: (v: PostCategory) => void;
  shown: number;
  onReset: () => void;
};
export function FilterBar({
  dates,
  setDates,
  brands,
  setBrands,
  type,
  setType,
  category,
  setCategory,
  shown,
  onReset
}: FilterBarProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const active = dates.length > 0 || brands.length > 0 || type !== 'All' || category !== 'All';
  const toggleDate = (k: string) => {
    const next = dates.includes(k) ? dates.filter(d => d !== k) : [...dates, k];
    setDates(next.length === 3 ? [] : next);
  };
  const toggleBrand = (b: string) => setBrands(brands.includes(b) ? brands.filter(x => x !== b) : [...brands, b]);
  const visibleBrands = brandOptions.filter(b => b.name.toLowerCase().includes(query.toLowerCase()));
  return <section className="-mx-6 max-[720px]:-mx-[14px] border-b border-[#27272a]" aria-label="Filters">
    <div className="flex flex-wrap items-center gap-2 px-6 py-3 max-[720px]:px-[14px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className={label}><Calendar size={13} /><span>Publish Date</span></span>
        {dateOptions.map(d => <button key={d.key} className={`${pill} ${dates.includes(d.key) ? on : off}`} onClick={() => toggleDate(d.key)}>{d.label}</button>)}
        <button className={`${pill} ${dates.length === 0 ? on : off}`} onClick={() => setDates([])}>All Dates</button>
      </div>
      <span className="w-px h-5 bg-[#27272a] mx-1 max-md:hidden" />
      <div className="relative">
        <button className={`${pill} ${brands.length ? on : off}`} onClick={() => setOpen(!open)} aria-expanded={open}><Tag size={13} /><span>Brand</span><ChevronDown size={13} /></button>
        {open && <div className="absolute left-0 top-10 z-50 w-[280px] max-h-[320px] overflow-y-auto rounded-xl border border-[#27272a] bg-[#18181b] shadow-2xl shadow-black/60">
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search brands..." className="sticky top-0 w-full bg-[#09090b] border-0 border-b border-[#27272a] px-3 py-2.5 text-[12px] text-zinc-300 outline-none placeholder:text-zinc-600" />
          <ul className="list-none m-0 p-1">
            <li><button className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[12px] text-zinc-300 bg-transparent border-0 cursor-pointer hover:bg-[#27272a]" onClick={() => setBrands([])}><span className={`grid place-items-center w-[14px] h-[14px] rounded-[3px] ${brands.length === 0 ? 'bg-orange-500' : 'bg-[#27272a]'}`}>{brands.length === 0 && <Check size={10} color="white" />}</span><span>All Brands</span></button></li>
            {visibleBrands.map(b => <li key={b.name}><button className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[12px] text-zinc-300 bg-transparent border-0 cursor-pointer hover:bg-[#27272a]" onClick={() => toggleBrand(b.name)}><span className={`grid place-items-center w-[14px] h-[14px] rounded-[3px] flex-none ${brands.includes(b.name) ? 'bg-orange-500' : 'bg-[#27272a]'}`}>{brands.includes(b.name) && <Check size={10} color="white" />}</span><span>{b.name}</span></button></li>)}
          </ul>
        </div>}
      </div>
      {brands.map(b => <button key={b} className={`${pill} ${on}`} onClick={() => toggleBrand(b)} aria-label={`Remove ${b}`}><span>Brand: {b}</span><X size={12} /></button>)}
      {brands.length > 0 && <button className="bg-transparent border-0 text-[12px] text-zinc-500 hover:text-zinc-300 cursor-pointer" onClick={() => setBrands([])}>Clear</button>}
      <span className="w-px h-5 bg-[#27272a] mx-1 max-md:hidden" />
      <div className="flex flex-wrap items-center gap-2">
        <span className={label}><LayoutGrid size={13} /><span>Type</span></span>
        {typeOptions.map(t => <button key={t.key} className={`${pill} ${type === t.key ? on : off}`} onClick={() => setType(t.key)}>{t.key}</button>)}
      </div>
      <span className="w-px h-5 bg-[#27272a] mx-1 max-md:hidden" />
      <div className="flex flex-wrap items-center gap-2">
        <span className={label}><Tag size={13} /><span>Category</span></span>
        {categoryOptions.map(c => <button key={c.key} className={`${pill} ${category === c.key ? on : off}`} onClick={() => setCategory(c.key)}>{c.key}</button>)}
      </div>
      <span className="group relative ml-auto inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-[#27272a] bg-[#18181b] text-[11px] text-zinc-500 cursor-help" tabIndex={0}>
        <Database size={12} /><span>Supabase-ready</span>
        <span className="pointer-events-none invisible group-hover:visible group-focus:visible absolute right-0 top-9 z-50 w-64 rounded-lg border border-[#3f3f46] bg-[#27272a] p-2.5 text-[12px] leading-snug text-zinc-200">Filters are structured to map directly to Supabase query params. Connect your DB to make filters live.</span>
      </span>
    </div>
    {active && <div className="flex items-center gap-2 px-6 pb-3 max-[720px]:px-[14px] text-[12px] text-zinc-400">
      <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
      <span>Showing <span className="mono text-zinc-200">{shown}</span> of 638 posts</span>
      <button className="ml-2 bg-transparent border-0 text-orange-400 hover:text-orange-300 cursor-pointer text-[12px]" onClick={onReset}>Reset all filters</button>
    </div>}
  </section>;
}