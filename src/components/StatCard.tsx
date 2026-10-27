import type { ReactNode } from 'react';
import { Info } from 'lucide-react';

export type Tint = 'none' | 'brand' | 'success' | 'warning' | 'destructive' | 'info';

/** Glossy icon tile: black base + two gradient rims + soft white glow (3-layer bezel). */
export function GlossyIconTile({ children }: { children: ReactNode }) {
  return <div className="icon-tile" aria-hidden="true">
    <div className="icon-tile__base" />
    <div className="icon-tile__rim1" />
    <div className="icon-tile__rim2" />
    <div className="icon-tile__icon">{children}</div>
  </div>;
}

/** KPI card with a data-driven tint gradient from the top-right corner. */
export function StatCard({ icon, label, value, delta, deltaTone, sub, tint = 'none', hint }: {
  icon: ReactNode; label: string; value: ReactNode; delta?: ReactNode; deltaTone?: Tint; sub?: ReactNode; tint?: Tint; hint?: string;
}) {
  return <article className={`kpi-card kpi-card--${tint}`}>
    <GlossyIconTile>{icon}</GlossyIconTile>
    <div className="kpi-body">
      <div className="kpi-label"><h3>{label}</h3>{hint && <span title={hint} className="kpi-hint"><Info size={13} /></span>}</div>
      <div className="kpi-value-row"><span className="kpi-value">{value}</span>{delta != null && delta !== '' && <span className={`kpi-delta kpi-delta--${deltaTone ?? tint}`}>{delta}</span>}</div>
      {sub && <p className="kpi-sub">{sub}</p>}
    </div>
  </article>;
}
