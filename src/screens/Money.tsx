import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Transaction } from '../lib/db'
import { monthKey, rupees } from '../lib/format'
import { byCategory } from '../lib/budget'
import MonthPicker from '../components/MonthPicker'
import TxSheet from '../components/TxSheet'
import ImportSheet from '../components/ImportSheet'
import { CategoryBars } from '../components/Charts'

export default function Money() {
  const [month, setMonth] = useState(monthKey())
  const [filter, setFilter] = useState<'all' | 'expense' | 'income'>('all')
  const [editing, setEditing] = useState<Transaction | 'new' | null>(null)
  const [importing, setImporting] = useState(false)
  const txs = useLiveQuery(() => db.transactions.where('date').startsWith(month).reverse().sortBy('date'), [month]) ?? []
  const cats = useLiveQuery(() => db.categories.toArray()) ?? []
  const icons = Object.fromEntries(cats.map((c) => [c.name, c.icon]))

  const income = txs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expense = txs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const shown = filter === 'all' ? txs : txs.filter((t) => t.type === filter)
  const groups = new Map<string, Transaction[]>()
  for (const t of shown) groups.set(t.date, [...(groups.get(t.date) ?? []), t])

  return (
    <>
      <header className="page-head row between">
        <h1>Money</h1>
        <button className="btn ghost small-btn" onClick={() => setImporting(true)}>⤓ Import statement</button>
      </header>
      <MonthPicker value={month} onChange={setMonth} />

      <section className="card">
        <div className="split three">
          <div><p className="muted">Income</p><p className="pos strong">{rupees(income)}</p></div>
          <div><p className="muted">Spent</p><p className="strong">{rupees(expense)}</p></div>
          <div><p className="muted">Left</p><p className={`strong ${income - expense < 0 ? 'neg' : ''}`}>{rupees(income - expense)}</p></div>
        </div>
      </section>

      {expense > 0 && (
        <section className="card">
          <h2>Where it went</h2>
          <CategoryBars rows={byCategory(txs)} icons={icons} />
        </section>
      )}

      <div className="seg small">
        {(['all', 'expense', 'income'] as const).map((f) => (
          <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : f === 'expense' ? 'Spent' : 'Income'}
          </button>
        ))}
      </div>

      {shown.length === 0 && (
        <section className="card empty">
          <p className="empty-icon" aria-hidden>🧾</p>
          <p>No entries this month. Tap <b>+</b> to add one, or import your bank statement.</p>
        </section>
      )}

      {[...groups.entries()].map(([date, list]) => (
        <section key={date} className="card tx-group">
          <p className="muted small">{new Date(date + 'T00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
          {list.map((t) => (
            <button key={t.id} className="tx" onClick={() => setEditing(t)}>
              <span className="tx-icon" aria-hidden>{icons[t.category] ?? '•'}</span>
              <span className="grow">
                <span className="tx-top"><span>{t.category}</span>
                  <span className={`num ${t.type === 'income' ? 'pos' : ''}`}>{t.type === 'income' ? '+' : '−'}{rupees(t.amount)}</span></span>
                {t.note && <span className="muted small ellipsis">{t.note}</span>}
              </span>
            </button>
          ))}
        </section>
      ))}

      <button className="fab" aria-label="Add income or expense" onClick={() => setEditing('new')}>+</button>
      {editing && <TxSheet tx={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {importing && <ImportSheet onClose={() => setImporting(false)} />}
    </>
  )
}
