import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { monthKey, rupees } from '../lib/format'
import { budgetStatus, levelFor } from '../lib/budget'
import MonthPicker from '../components/MonthPicker'
import { toast } from '../lib/toast'

export default function Budgets() {
  const [month, setMonth] = useState(monthKey())
  const [editing, setEditing] = useState(false)
  const data = useLiveQuery(async () => ({
    budgets: await db.budgets.toArray(),
    cats: await db.categories.where('type').equals('expense').toArray(),
    txs: await db.transactions.where('date').startsWith(month).toArray()
  }), [month])
  if (!data) return null
  const icons = Object.fromEntries(data.cats.map((c) => [c.name, c.icon]))
  const status = budgetStatus(month, data.budgets, data.txs).sort((a, b) => b.pct - a.pct)
  const totalLimit = status.reduce((s, b) => s + b.limit, 0)
  const totalSpent = status.reduce((s, b) => s + b.spent, 0)

  return (
    <>
      <header className="page-head row between">
        <h1>Budgets</h1>
        <button className="btn ghost small-btn" onClick={() => setEditing(!editing)}>{editing ? 'Done' : '✎ Set limits'}</button>
      </header>

      {editing ? (
        <BudgetEditor cats={data.cats} budgets={data.budgets} onDone={() => setEditing(false)} />
      ) : (
        <>
          <MonthPicker value={month} onChange={setMonth} />
          {status.length === 0 ? (
            <section className="card empty">
              <p className="empty-icon" aria-hidden>🎯</p>
              <p>No budgets yet. Tap <b>Set limits</b> to choose how much you want to spend on each category every month.</p>
            </section>
          ) : (
            <>
              <section className="card">
                <p className="muted">Total budget</p>
                <p className="strong">{rupees(totalSpent)} <span className="muted">of {rupees(totalLimit)}</span></p>
                <div className={`bar ${levelFor(totalSpent, totalLimit)}`}><span style={{ width: `${Math.min(100, (totalSpent / totalLimit) * 100)}%` }} /></div>
                <p className="muted small">{totalSpent <= totalLimit ? `${rupees(totalLimit - totalSpent)} left to spend` : `${rupees(totalSpent - totalLimit)} over`}</p>
              </section>
              <section className="card">
                <ul className="budget-list">
                  {status.map((b) => (
                    <li key={b.category}>
                      <div className="cat-bar-head">
                        <span>{icons[b.category]} {b.category}</span>
                        <span className="num">{rupees(b.spent)} <span className="muted small">/ {rupees(b.limit)}</span></span>
                      </div>
                      <div className={`bar ${b.level}`}><span style={{ width: `${Math.min(100, b.pct)}%` }} /></div>
                      {b.level !== 'ok' && (
                        <p className={`small ${b.level === 'over' ? 'neg' : 'warn-text'}`}>
                          {b.level === 'over' ? `Over by ${rupees(b.spent - b.limit)}` : `${Math.round(b.pct)}% used, ${rupees(b.limit - b.spent)} left`}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </>
      )}
    </>
  )
}

function BudgetEditor({ cats, budgets, onDone }: {
  cats: { name: string; icon: string }[]; budgets: { category: string; monthlyLimit: number }[]; onDone: () => void
}) {
  const [vals, setVals] = useState<Record<string, string>>(
    Object.fromEntries(budgets.map((b) => [b.category, String(b.monthlyLimit)]))
  )
  async function save() {
    await db.transaction('rw', db.budgets, async () => {
      await db.budgets.clear()
      await db.budgets.bulkAdd(
        Object.entries(vals).map(([category, v]) => ({ category, monthlyLimit: parseFloat(v) })).filter((b) => b.monthlyLimit > 0)
      )
    })
    toast('Budgets saved')
    onDone()
  }
  return (
    <section className="card">
      <p className="muted small">Monthly limit for each category. Leave blank for no limit. You'll get a warning at 80% and when you go over.</p>
      <ul className="budget-edit">
        {cats.map((c) => (
          <li key={c.name}>
            <span>{c.icon} {c.name}</span>
            <label className="money-input"><span>₹</span>
              <input inputMode="numeric" placeholder="No limit" aria-label={`${c.name} monthly limit`} value={vals[c.name] ?? ''}
                onChange={(e) => setVals({ ...vals, [c.name]: e.target.value.replace(/[^0-9]/g, '') })} />
            </label>
          </li>
        ))}
      </ul>
      <div className="row end"><button className="btn" onClick={save}>Save budgets</button></div>
    </section>
  )
}
