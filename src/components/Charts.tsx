import { rupees } from '../lib/format'
import { monthLabel } from '../lib/format'

export function CategoryBars({ rows, icons, limit = 6 }: {
  rows: { category: string; amount: number }[]; icons: Record<string, string>; limit?: number
}) {
  if (!rows.length) return <p className="muted small">No spending recorded yet.</p>
  const shown = rows.slice(0, limit)
  const rest = rows.slice(limit).reduce((s, r) => s + r.amount, 0)
  if (rest > 0) shown.push({ category: 'Everything else', amount: rest })
  const max = Math.max(...shown.map((r) => r.amount))
  const total = rows.reduce((s, r) => s + r.amount, 0)
  return (
    <ul className="cat-bars">
      {shown.map((r) => (
        <li key={r.category}>
          <div className="cat-bar-head">
            <span>{icons[r.category] ?? '•'} {r.category}</span>
            <span className="num">{rupees(r.amount)} <span className="muted small">{Math.round((r.amount / total) * 100)}%</span></span>
          </div>
          <div className="bar"><span style={{ width: `${(r.amount / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  )
}

export function MonthBars({ data }: { data: { month: string; income: number; expense: number }[] }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.income, d.expense]))
  const h = 120
  return (
    <div>
      <div className="legend"><span className="dot inc" /> Income <span className="dot exp" /> Spent</div>
      <svg viewBox={`0 0 ${data.length * 52} ${h + 22}`} className="month-bars" role="img"
        aria-label="Income and spending for the last months">
        {data.map((d, i) => {
          const x = i * 52 + 8
          const ih = (d.income / max) * h
          const eh = (d.expense / max) * h
          return (
            <g key={d.month}>
              <title>{`${monthLabel(d.month)}: income ${rupees(d.income)}, spent ${rupees(d.expense)}`}</title>
              <rect x={x} y={h - ih} width={16} height={ih} rx={3} className="inc" />
              <rect x={x + 18} y={h - eh} width={16} height={eh} rx={3} className="exp" />
              <text x={x + 17} y={h + 16} textAnchor="middle">{monthLabel(d.month).slice(0, 3)}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
