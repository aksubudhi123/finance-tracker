import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { monthKey, monthLabel, rupees } from '../lib/format'
import { summarise } from '../lib/summary'
import type { Tab } from '../App'

export default function Home({ go }: { go: (t: Tab) => void }) {
  const month = monthKey()
  const data = useLiveQuery(async () => {
    const [txs, budgets, loans] = await Promise.all([
      db.transactions.where('date').startsWith(month).toArray(),
      db.budgets.toArray(),
      db.loans.toArray()
    ])
    return { txs, budgets, loans }
  }, [month])

  if (!data) return null
  const s = summarise(month, data.txs, data.budgets, data.loans)
  const budgetPct = s.budgetTotal ? Math.min(100, Math.round((s.budgetUsed / s.budgetTotal) * 100)) : 0

  return (
    <>
      <header className="page-head">
        <p className="eyebrow">{monthLabel(month)}</p>
        <h1>Hello 👋</h1>
      </header>

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
          <div className="bar"><span style={{ width: `${budgetPct}%` }} /></div>
        </button>
        <button className="card tile" onClick={() => go('loans')}>
          <p className="muted">Total debt</p>
          <p className="strong">{s.totalDebt ? rupees(s.totalDebt) : 'No loans yet'}</p>
          {s.totalEmi > 0 && <p className="muted small">EMIs {rupees(s.totalEmi)}/month</p>}
        </button>
      </div>

      <section className="card">
        <h2>Getting started</h2>
        <ol className="steps">
          <li>Install the app on your phone (see More → Install)</li>
          <li>Add income and expenses <span className="tag">coming in step 2</span></li>
          <li>Set monthly budgets <span className="tag">coming in step 2</span></li>
          <li>Import loans from your Excel planner <span className="tag">coming in step 3</span></li>
          <li>Get savings and income suggestions <span className="tag">coming in step 4</span></li>
        </ol>
      </section>
    </>
  )
}
