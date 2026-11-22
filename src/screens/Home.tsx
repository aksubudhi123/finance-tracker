import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { monthKey, monthLabel, rupees } from '../lib/format'
import { summarise } from '../lib/summary'
import { budgetStatus, byCategory, lastMonths, levelFor } from '../lib/budget'
import { CategoryBars, MonthBars } from '../components/Charts'
import TxSheet from '../components/TxSheet'
import type { Tab } from '../App'

export default function Home({ go }: { go: (t: Tab) => void }) {
  const month = monthKey()
  const [adding, setAdding] = useState(false)
  const months = lastMonths(month, 6)
  const data = useLiveQuery(async () => {
    const [txs, budgets, loans, cats] = await Promise.all([
      db.transactions.where('date').aboveOrEqual(months[0] + '-01').toArray(),
      db.budgets.toArray(),
      db.loans.toArray(),
      db.categories.toArray()
    ])
    return { txs, budgets, loans, cats }
  }, [month])

  if (!data) return null
  const thisMonth = data.txs.filter((t) => t.date.startsWith(month))
  const s = summarise(month, thisMonth, data.budgets, data.loans)
  const budgetPct = s.budgetTotal ? Math.min(100, Math.round((s.budgetUsed / s.budgetTotal) * 100)) : 0
  const alerts = budgetStatus(month, data.budgets, thisMonth).filter((b) => b.level !== 'ok').sort((a, b) => b.pct - a.pct)
  const icons = Object.fromEntries(data.cats.map((c) => [c.name, c.icon]))
  const trend = months.map((m) => {
    const list = data.txs.filter((t) => t.date.startsWith(m))
    return {
      month: m,
      income: list.filter((t) => t.type === 'income').reduce((a, t) => a + t.amount, 0),
      expense: list.filter((t) => t.type === 'expense').reduce((a, t) => a + t.amount, 0)
    }
  })
  const hasAny = data.txs.length > 0

  return (
    <>
      <header className="page-head">
        <p className="eyebrow">{monthLabel(month)}</p>
        <h1>Hello 👋</h1>
      </header>

      {alerts.map((a) => (
        <button key={a.category} className={`alert ${a.level}`} onClick={() => go('budgets')}>
          {a.level === 'over' ? '🚨' : '⚠️'} <b>{a.category}</b>{' '}
          {a.level === 'over' ? `is over budget by ${rupees(a.spent - a.limit)}` : `has used ${Math.round(a.pct)}% of its budget`}
        </button>
      ))}

      <section className="card hero">
        <p className="muted">Left this month</p>
        <p className={`big ${s.balance < 0 ? 'neg' : ''}`}>{rupees(s.balance)}</p>
        <div className="split">
          <div><p className="muted">Income</p><p className="pos strong">{rupees(s.income)}</p></div>
          <div><p className="muted">Spent</p><p className="strong">{rupees(s.expense)}</p></div>
        </div>
      </section>

      <div className="grid2">
        <button className="card tile" onClick={() => go('budgets')}>
          <p className="muted">Budget used</p>
          <p className="strong">{s.budgetTotal ? `${budgetPct}%` : 'Not set'}</p>
          <div className={`bar ${s.budgetTotal ? levelFor(s.budgetUsed, s.budgetTotal) : ''}`}><span style={{ width: `${budgetPct}%` }} /></div>
        </button>
        <button className="card tile" onClick={() => go('loans')}>
          <p className="muted">Total debt</p>
          <p className="strong">{s.totalDebt ? rupees(s.totalDebt) : 'No loans yet'}</p>
          {s.totalEmi > 0 && <p className="muted small">EMIs {rupees(s.totalEmi)}/month</p>}
        </button>
      </div>

      {s.expense > 0 && (
        <section className="card">
          <h2>Top spending this month</h2>
          <CategoryBars rows={byCategory(thisMonth)} icons={icons} limit={4} />
          <button className="link" onClick={() => go('money')}>See all entries ›</button>
        </section>
      )}

      {hasAny && (
        <section className="card">
          <h2>Last 6 months</h2>
          <MonthBars data={trend} />
        </section>
      )}

      {!hasAny && (
        <section className="card">
          <h2>Getting started</h2>
          <ol className="steps">
            <li>Install the app on your phone (see More → Install)</li>
            <li>Add your salary and a few expenses with the <b>+</b> button, or import a bank statement from the Money tab</li>
            <li>Set monthly budgets in the Budgets tab</li>
            <li>Import loans from your Excel planner <span className="tag">coming in step 3</span></li>
          </ol>
        </section>
      )}

      <button className="fab" aria-label="Add income or expense" onClick={() => setAdding(true)}>+</button>
      {adding && <TxSheet onClose={() => setAdding(false)} />}
    </>
  )
}
