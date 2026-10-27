import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';

// Google Analytics–style date range picker. Dates are 'YYYY-MM-DD' strings in WIB (UTC+7).
export type DateRange = { start: string; end: string; preset: PresetKey } | null;
export type PresetKey = 'all' | 'custom' | 'today' | 'yesterday' | 'thisWeek' | 'last7' | 'lastWeek' | 'last28' | 'last30' | 'thisMonth' | 'lastMonth' | 'last90' | 'quarter';

const WIB_MS = 7 * 3600 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const toKey = (d: Date) => d.toISOString().slice(0, 10);
const fromKey = (k: string) => new Date(`${k}T00:00:00Z`);
const addDays = (k: string, n: number) => { const d = fromKey(k); d.setUTCDate(d.getUTCDate() + n); return toKey(d); };
export const todayWib = () => toKey(new Date(Date.now() + WIB_MS));
export const fmtDay = (k: string, year = true) => { const d = fromKey(k); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}${year ? `, ${d.getUTCFullYear()}` : ''}`; };
export const fmtRange = (s: string, e: string) => {
  const sameYear = s.slice(0, 4) === e.slice(0, 4);
  return s === e ? fmtDay(s) : `${fmtDay(s, !sameYear)} - ${fmtDay(e)}`;
};
const parseDay = (text: string): string | null => {
  const t = Date.parse(`${text.trim()} 00:00:00 UTC`);
  return Number.isNaN(t) ? null : toKey(new Date(t));
};

export const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'all', label: 'All time' }, { key: 'custom', label: 'Custom' }, { key: 'today', label: 'Today' }, { key: 'yesterday', label: 'Yesterday' },
  { key: 'thisWeek', label: 'This week (Sun - Today)' }, { key: 'last7', label: 'Last 7 days' }, { key: 'lastWeek', label: 'Last week (Sun - Sat)' },
  { key: 'last28', label: 'Last 28 days' }, { key: 'last30', label: 'Last 30 days' }, { key: 'thisMonth', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' }, { key: 'last90', label: 'Last 90 days' }, { key: 'quarter', label: 'Quarter to date' },
];

export function presetRange(key: PresetKey, today = todayWib()): { start: string; end: string } | null {
  const d = fromKey(today);
  const dow = d.getUTCDay();
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  const first = (yy: number, mm: number) => toKey(new Date(Date.UTC(yy, mm, 1)));
  switch (key) {
    case 'today': return { start: today, end: today };
    case 'yesterday': { const k = addDays(today, -1); return { start: k, end: k }; }
    case 'thisWeek': return { start: addDays(today, -dow), end: today };
    case 'last7': return { start: addDays(today, -7), end: addDays(today, -1) };
    case 'lastWeek': return { start: addDays(today, -dow - 7), end: addDays(today, -dow - 1) };
    case 'last28': return { start: addDays(today, -28), end: addDays(today, -1) };
    case 'last30': return { start: addDays(today, -30), end: addDays(today, -1) };
    case 'last90': return { start: addDays(today, -90), end: addDays(today, -1) };
    case 'thisMonth': return { start: first(y, m), end: today };
    case 'lastMonth': return { start: first(y, m - 1), end: addDays(first(y, m), -1) };
    case 'quarter': return { start: first(y, m - (m % 3)), end: today };
    default: return null;
  }
}

export const rangeLabel = (r: DateRange) => r ? PRESETS.find(p => p.key === r.preset)?.label ?? 'Custom' : 'All time';

function Month({ year, month, start, end, hover, today, dataDays, onPick, onHover }: {
  year: number; month: number; start: string | null; end: string | null; hover: string | null; today: string;
  dataDays: Set<string>; onPick: (k: string) => void; onHover: (k: string | null) => void;
}) {
  const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const lo = start && (end ?? hover) ? [start, end ?? hover!].sort()[0] : start;
  const hi = start && (end ?? hover) ? [start, end ?? hover!].sort()[1] : start;
  const cells: (string | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: days }, (_, i) => toKey(new Date(Date.UTC(year, month, i + 1))))];
  return <div className="mb-4">
    <p className="m-0 mb-2 pl-1 text-[12px] font-medium tracking-wide text-zinc-400">{MONTHS[month].toUpperCase()} {year}</p>
    <div className="grid grid-cols-7 gap-y-1">
      {cells.map((k, i) => {
        if (!k) return <span key={`e${i}`} />;
        const future = k > today;
        const inRange = !!lo && !!hi && k >= lo && k <= hi;
        const edge = k === lo || k === hi;
        return <button key={k} data-day={k} disabled={future} onClick={() => onPick(k)} onMouseEnter={() => onHover(k)} onMouseLeave={() => onHover(null)}
          className={`relative h-8 border-0 text-[12px] ${future ? 'text-zinc-700 cursor-default bg-transparent' : 'cursor-pointer text-zinc-200'} ${inRange && !edge ? 'bg-[#ff743d]/15' : 'bg-transparent'}`}>
          <span className={`mx-auto grid place-items-center w-8 h-8 rounded-full ${edge ? 'bg-orange-500 text-white font-semibold' : k === today ? 'ring-1 ring-orange-500/70' : !future ? 'hover:bg-[#27272a]' : ''}`}>{Number(k.slice(8))}</span>
          {dataDays.has(k) && !edge && <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-orange-500/80" />}
        </button>;
      })}
    </div>
  </div>;
}

export function DateRangePicker({ value, onChange, dataDays }: { value: DateRange; onChange: (r: DateRange) => void; dataDays: string[] }) {
  const today = todayWib();
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<PresetKey>(value?.preset ?? 'all');
  const [start, setStart] = useState<string | null>(value?.start ?? null);
  const [end, setEnd] = useState<string | null>(value?.end ?? null);
  const [hover, setHover] = useState<string | null>(null);
  const [startText, setStartText] = useState('');
  const [endText, setEndText] = useState('');
  const wrap = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const daySet = useMemo(() => new Set(dataDays), [dataDays]);

  const firstData = dataDays.length ? [...dataDays].sort()[0] : today;
  const allRange = { start: firstData < today ? firstData : today, end: today };

  // months shown: from 12 months before the earliest relevant date up to the current month
  const months = useMemo(() => {
    const from = fromKey(addDays([firstData, today].sort()[0], -365));
    const out: { y: number; m: number }[] = [];
    const t = fromKey(today);
    for (let y = from.getUTCFullYear(), m = from.getUTCMonth(); y < t.getUTCFullYear() || (y === t.getUTCFullYear() && m <= t.getUTCMonth()); m++) {
      if (m > 11) { m = 0; y++; }
      out.push({ y, m });
    }
    return out;
  }, [firstData, today]);

  const syncFrom = (r: DateRange) => {
    const p = r?.preset ?? 'all';
    const s = r?.start ?? allRange.start, e = r?.end ?? allRange.end;
    setPreset(p); setStart(s); setEnd(e); setStartText(fmtDay(s)); setEndText(fmtDay(e));
  };

  useEffect(() => { if (open) syncFrom(value); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  // keep the selected end month in view
  useEffect(() => {
    if (!open || !scroller.current) return;
    const target = scroller.current.querySelector(`[data-day="${end ?? today}"]`) as HTMLElement | null;
    if (target) scroller.current.scrollTop = Math.max(0, target.offsetTop - scroller.current.clientHeight + 64);
  }, [open, preset]); // eslint-disable-line react-hooks/exhaustive-deps

  const choosePreset = (k: PresetKey) => {
    setPreset(k);
    if (k === 'custom') return;
    const r = k === 'all' ? allRange : presetRange(k, today)!;
    setStart(r.start); setEnd(r.end); setStartText(fmtDay(r.start)); setEndText(fmtDay(r.end));
  };
  const pick = (k: string) => {
    setPreset('custom');
    if (!start || end) { setStart(k); setEnd(null); setStartText(fmtDay(k)); setEndText(''); }
    else { const [s, e] = [start, k].sort(); setStart(s); setEnd(e); setStartText(fmtDay(s)); setEndText(fmtDay(e)); }
  };
  const commitText = (which: 'start' | 'end') => {
    const k = parseDay(which === 'start' ? startText : endText);
    if (!k || k > today) { setStartText(start ? fmtDay(start) : ''); setEndText(end ? fmtDay(end) : ''); return; }
    setPreset('custom');
    if (which === 'start') { setStart(k); if (end && k > end) setEnd(k); } else { setEnd(k); if (start && k < start) setStart(k); }
  };
  const apply = () => {
    if (!start) return;
    const e = end ?? start;
    onChange(preset === 'all' ? null : { start, end: e, preset });
    setOpen(false);
  };

  const shown = value ?? { ...allRange, preset: 'all' as PresetKey };
  return <div className="relative" ref={wrap}>
    <button onClick={() => setOpen(!open)} aria-expanded={open}
      className={`inline-flex items-center gap-2 h-8 pl-1.5 pr-2.5 rounded-lg border text-[12px] whitespace-nowrap cursor-pointer ${value ? 'bg-[#ff743d]/10 border-[#ff743d]/40' : 'bg-[#18181b] border-[#27272a] hover:border-[#3f3f46]'}`}>
      <span className={`inline-flex items-center gap-1 h-6 px-2 rounded-md text-[11px] font-medium ${value ? 'bg-orange-500/20 text-orange-300' : 'bg-[#27272a] text-zinc-300'}`}><Calendar size={12} />{rangeLabel(value)}</span>
      <span className="text-zinc-200">{fmtRange(shown.start, shown.end)}</span>
      <ChevronDown size={13} className="text-zinc-500" />
    </button>
    {open && <div className="absolute left-0 top-10 z-50 flex max-w-[calc(100vw-28px)] overflow-hidden rounded-xl border border-[#27272a] bg-[#18181b] shadow-2xl shadow-black/60 max-sm:flex-col" role="dialog" aria-label="Choose date range">
      <ul className="m-0 w-[210px] max-sm:w-full max-h-[440px] max-sm:max-h-[170px] overflow-y-auto list-none p-1.5 border-r border-[#27272a] max-sm:border-r-0 max-sm:border-b">
        {PRESETS.map((p, i) => <li key={p.key} className={i === 2 ? 'mt-1 pt-1 border-t border-[#27272a]' : ''}>
          <button onClick={() => choosePreset(p.key)} className={`w-full text-left px-3 py-2 rounded-md border-0 text-[12.5px] cursor-pointer ${preset === p.key ? 'bg-[#ff743d]/12 text-orange-400 font-medium' : 'bg-transparent text-zinc-300 hover:bg-[#27272a]'}`}>{p.label}</button>
        </li>)}
      </ul>
      <div className="flex flex-col w-[300px] max-sm:w-full">
        <div className="flex items-center gap-2 px-4 pt-4 pb-3">
          {(['start', 'end'] as const).map((w, i) => <label key={w} className="relative flex-1">
            <span className="absolute -top-2 left-2 px-1 bg-[#18181b] text-[10px] text-zinc-500">{w === 'start' ? 'Start date' : 'End date'}</span>
            <input value={w === 'start' ? startText : endText} onChange={e => (w === 'start' ? setStartText : setEndText)(e.target.value)} onBlur={() => commitText(w)} onKeyDown={e => { if (e.key === 'Enter') commitText(w); }}
              className={`w-full h-9 rounded-md border bg-transparent px-2.5 text-[12.5px] text-zinc-100 outline-none ${(w === 'start' ? !end && !!start : !!start && !end) ? 'border-orange-500' : 'border-[#3f3f46] focus:border-orange-500'}`} />
            {i === 0 && <span className="sr-only">to</span>}
          </label>)}
        </div>
        <div className="grid grid-cols-7 px-4 pb-1 text-center text-[11px] text-zinc-500 border-b border-[#27272a]">{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i}>{d}</span>)}</div>
        <div ref={scroller} className="relative h-[300px] overflow-y-auto px-4 pt-3">
          {months.map(({ y, m }) => <div key={`${y}-${m}`} data-month={`${y}-${String(m + 1).padStart(2, '0')}`}>
            <Month year={y} month={m} start={start} end={end} hover={hover} today={today} dataDays={daySet} onPick={pick} onHover={setHover} />
          </div>)}
        </div>
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-[#27272a]">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500"><span className="w-1.5 h-1.5 rounded-full bg-orange-500/80" />has posts</span>
          <div className="flex gap-1">
            <button onClick={() => setOpen(false)} className="h-8 px-3 rounded-md border-0 bg-transparent text-[12.5px] text-zinc-300 cursor-pointer hover:bg-[#27272a]">Cancel</button>
            <button onClick={apply} disabled={!start} className="h-8 px-4 rounded-md border-0 bg-orange-500 text-[12.5px] font-medium text-white cursor-pointer hover:bg-orange-400 disabled:opacity-40">Apply</button>
          </div>
        </div>
      </div>
    </div>}
  </div>;
}
