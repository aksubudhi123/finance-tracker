import { monthKey, monthLabel } from '../lib/format'

export function shiftMonth(key: string, by: number) {
  const [y, m] = key.split('-').map(Number)
  return monthKey(new Date(y, m - 1 + by, 1))
}

export default function MonthPicker({ value, onChange }: { value: string; onChange: (m: string) => void }) {
  const atNow = value >= monthKey()
  return (
    <div className="month-picker">
      <button aria-label="Previous month" onClick={() => onChange(shiftMonth(value, -1))}>‹</button>
      <span>{monthLabel(value)}</span>
      <button aria-label="Next month" disabled={atNow} onClick={() => onChange(shiftMonth(value, 1))}>›</button>
    </div>
  )
}
