import { rupees, monthLabel } from '../lib/format'

/** Outstanding debt over time: plan vs EMIs only. */
export default function DebtChart({ plan, baseline }: { plan: { month: string; v: number }[]; baseline: { month: string; v: number }[] }) {
  const W = 320, H = 140, P = 4
  const n = Math.max(plan.length, baseline.length)
  const max = Math.max(1, ...baseline.map((p) => p.v), ...plan.map((p) => p.v))
  const path = (pts: { v: number }[]) =>
    pts.map((p, i) => `${i ? 'L' : 'M'}${(P + (i / Math.max(1, n - 1)) * (W - 2 * P)).toFixed(1)},${(H - P - (p.v / max) * (H - 2 * P)).toFixed(1)}`).join(' ')
  const yearTicks = baseline.filter((p, i) => i % 60 === 0 && i > 0)
  return (
    <div>
      <div className="legend"><span className="dot exp" /> Your plan <span className="dot base" /> EMIs only</div>
      <svg viewBox={`0 0 ${W} ${H + 18}`} className="debt-chart" role="img"
        aria-label={`Debt reaches zero in ${plan.at(-1) ? monthLabel(plan.at(-1)!.month) : ''}, versus ${baseline.at(-1) ? monthLabel(baseline.at(-1)!.month) : ''} paying EMIs only`}>
        <path d={path(baseline)} className="base" />
        <path d={path(plan)} className="plan" />
        {yearTicks.map((p) => {
          const i = baseline.indexOf(p)
          return <text key={p.month} x={P + (i / Math.max(1, n - 1)) * (W - 2 * P)} y={H + 14} textAnchor="middle">{p.month.slice(0, 4)}</text>
        })}
        <text x={W - P} y={12} textAnchor="end" className="lbl">Peak {rupees(max)}</text>
      </svg>
    </div>
  )
}
