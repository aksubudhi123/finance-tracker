import { useRef, useState } from 'react'
import { db, setSetting, type Loan } from '../lib/db'
import { useDebt, type DebtSettings } from '../lib/debt'
import { STRATEGIES, mIndex, type SimResult } from '../lib/loans'
import { isPlannerWorkbook, readPlanner } from '../lib/excelImport'
import { monthKey, monthLabel, rupees } from '../lib/format'
import { toast } from '../lib/toast'
import LoanSheet from '../components/LoanSheet'
import PlanSheet, { clearLoans } from '../components/PlanSheet'
import PaySheet from '../components/PaySheet'
import DebtChart from '../components/LineChart'
import MonthPicker, { shiftMonth } from '../components/MonthPicker'

const short = (m: string | null) => (m ? monthLabel(m).replace(/(\w{3})\w*/, '$1') : 'Over 25 years')
const years = (from: string, to: string | null) => {
  if (!to) return ''
  const n = mIndex(to) - mIndex(from) + 1
  return `${Math.floor(n / 12)} yr${n % 12 ? ` ${n % 12} mo` : ''}`
}
const strategyLabel = (s: SimResult['strategy']) => STRATEGIES.find((x) => x.id === s)?.label ?? 'EMIs only'

export default function Loans() {
  const debt = useDebt()
  const [editing, setEditing] = useState<Loan | 'new' | null>(null)
  const [planOpen, setPlanOpen] = useState(false)
  const [paying, setPaying] = useState(false)
  const [month, setMonth] = useState(monthKey())
  const fileRef = useRef<HTMLInputElement>(null)

  async function importExcel(file: File) {
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
      if (!isPlannerWorkbook(wb)) throw new Error("This doesn't look like the Debt Prepayment Planner (no Loans and Scenarios sheets).")
      const r = readPlanner(wb)
      if (debt?.loans.length && !window.confirm('Replace your current loans and payment log with the ones in this file?')) return
      await clearLoans()
      const ids: Record<number, number> = {}
      for (const { slot, ...l } of r.loans) ids[slot] = (await db.loans.add(l)) as number
      const map = (id?: number) => (id != null && id < 0 ? ids[-id - 1] : id)
      const settings: DebtSettings = {
        ...r.settings,
        extras: r.settings.extras!.map((e) => ({ ...e, loanId: map(e.loanId) })),
        rateChanges: r.settings.rateChanges!.map((c) => ({ ...c, loanId: map(c.loanId)! }))
      }
      await setSetting('debtPlan', settings)
      await db.loanPayments.bulkAdd(r.payments.map((p) => ({ loanId: ids[p.slot], month: p.month, amount: p.amount })))
      toast(`Imported ${r.loans.length} loans${r.payments.length ? ` and ${new Set(r.payments.map((p) => p.month)).size} logged month(s)` : ''}`)
      if (r.warnings.length) setTimeout(() => toast(r.warnings.join(' '), 'warn'), 2600)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not read that file.', 'bad')
    }
  }

  const fileInput = (
    <input ref={fileRef} type="file" hidden accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      onChange={(e) => { const f = e.target.files?.[0]; if (f) importExcel(f); e.target.value = '' }} />
  )

  if (!debt) return null
  if (!debt.loans.length || !debt.comparison || !debt.plan) {
    return (
      <>
        <header className="page-head"><h1>Loans</h1></header>
        <section className="card empty">
          <p className="empty-icon" aria-hidden>🏦</p>
          <p>Add your loans to see when you'll be debt-free and what to pay each month.</p>
          <div className="row center-row">
            <button className="btn" onClick={() => fileRef.current?.click()}>Import my Excel planner</button>
            <button className="btn ghost" onClick={() => setEditing('new')}>Add a loan</button>
          </div>
          {fileInput}
        </section>
        {editing && <LoanSheet loan={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      </>
    )
  }

  const { loans, settings, comparison: c, plan } = debt
  const now = monthKey()
  const row = plan.months.find((m) => m.month === month)
  const nowRow = plan.months.find((m) => m.month === now)
  const outstandingNow = nowRow ? nowRow.loans.reduce((a, l) => a + l.opening, 0) : plan.months[0]?.loans.reduce((a, l) => a + l.opening, 0) ?? 0
  const saved = c.baseline.totalCost - plan.totalCost
  const monthsSaved = c.baseline.debtFreeMonth && plan.debtFreeMonth ? mIndex(c.baseline.debtFreeMonth) - mIndex(plan.debtFreeMonth) : 0
  const name = (id: number) => loans.find((l) => l.id === id)?.name ?? ''
  const series = (r: SimResult) => r.months.map((m) => ({ month: m.month, v: m.totalOutstanding }))
  const firstMonth = plan.months[0]?.month ?? settings.startMonth
  const lastMonth = plan.months.at(-1)?.month ?? firstMonth

  return (
    <>
      <header className="page-head row between">
        <h1>Loans</h1>
        <button className="btn ghost small-btn" onClick={() => setPlanOpen(true)}>⚙ Plan</button>
      </header>

      <section className="card hero">
        <p className="muted">Debt-free in</p>
        <p className="big">{plan.debtFreeMonth ? monthLabel(plan.debtFreeMonth) : 'over 25 years'}</p>
        <p className="muted small">{years(now > firstMonth ? now : firstMonth, plan.debtFreeMonth)} from now · following “{strategyLabel(plan.strategy)}”</p>
        <div className="split">
          <div><p className="muted">Still owed</p><p className="strong">{rupees(outstandingNow)}</p></div>
          <div><p className="muted">Saved vs EMIs only</p><p className="strong pos">{rupees(saved)}</p>
            {monthsSaved > 0 && <p className="muted small">{Math.floor(monthsSaved / 12)} yrs {monthsSaved % 12} mo sooner</p>}</div>
        </div>
      </section>

      <section className="card">
        <div className="row between"><h2>What to pay</h2></div>
        <MonthPicker value={month} onChange={setMonth} min={firstMonth} max={lastMonth} />
        {!row ? (
          <p className="muted small">{month > lastMonth ? 'All loans are closed by then. 🎉' : 'This month is before your plan starts.'}</p>
        ) : (
          <>
            <ul className="pay-list">
              {row.loans.map((lm) => {
                const total = lm.emi + lm.prepay + lm.charge
                return (
                  <li key={lm.loanId} className={lm.prepay > 0 ? 'extra' : ''}>
                    <div className="tx-top"><b>{name(lm.loanId)}</b><span className="num strong">{rupees(total)}</span></div>
                    <div className="tx-top muted small">
                      <span>EMI {rupees(lm.emi)}{lm.prepay > 0 && <> + <b className="pos">{lm.closedInFull ? 'close in full' : 'extra'} {rupees(lm.prepay)}</b></>}{lm.charge > 0 && <> + charge {rupees(lm.charge)}</>}</span>
                      <span>{lm.logged ? '✓ Paid' : ''}</span>
                    </div>
                  </li>
                )
              })}
            </ul>
            {row.reserveIn > 0 && <p className="note small">Put {rupees(row.reserveIn)} aside in savings this month. No loan can take it yet; it will be used to prepay later.</p>}
            {row.reserveOut > 0 && <p className="note small">Use {rupees(row.reserveOut)} from your savings this month (included above).</p>}
            <div className="row between">
              <span className="muted small">Total {rupees(row.loans.reduce((a, l) => a + l.emi + l.prepay + l.charge, 0))}</span>
              <button className="btn small-btn" onClick={() => setPaying(true)}>{row.loans.some((l) => l.logged) ? 'Edit what I paid' : 'Mark as paid'}</button>
            </div>
          </>
        )}
      </section>

      <section className="card">
        <h2>Your loans</h2>
        <ul className="loan-list">
          {loans.map((l) => {
            const nowBal = (nowRow ?? plan.months[0])?.loans.find((x) => x.loanId === l.id)?.opening ?? 0
            const paidPct = Math.max(0, Math.min(100, Math.round((1 - nowBal / l.outstanding) * 100)))
            return (
              <li key={l.id}>
                <button className="loan" onClick={() => setEditing(l)}>
                  <div className="tx-top"><b>{l.name}</b><span className="num">{rupees(nowBal)}</span></div>
                  <div className="tx-top muted small"><span>{l.ratePct}% · EMI {rupees(l.emi)}{l.chargePct ? ` · ${l.chargePct}% prepay charge` : ''}</span>
                    <span>closes {short(plan.closes[l.id!] ?? null)}</span></div>
                  <div className="bar"><span style={{ width: `${paidPct}%` }} /></div>
                </button>
              </li>
            )
          })}
        </ul>
        <div className="row">
          <button className="btn ghost small-btn" onClick={() => setEditing('new')}>+ Add loan</button>
          <button className="btn ghost small-btn" onClick={() => fileRef.current?.click()}>Re-import Excel</button>
        </div>
        {fileInput}
      </section>

      <section className="card">
        <h2>Debt over time</h2>
        <DebtChart plan={series(plan)} baseline={series(c.baseline)} />
      </section>

      <section className="card">
        <h2>Compare plans</h2>
        <table className="compare">
          <thead><tr><th>Plan</th><th>Debt-free</th><th>Interest + charges</th></tr></thead>
          <tbody>
            {[...c.plans, c.baseline].map((p) => (
              <tr key={p.strategy} className={p === plan ? 'best' : ''}>
                <td>{strategyLabel(p.strategy)}{p === plan && <span className="tag">following</span>}</td>
                <td>{short(p.debtFreeMonth)}</td>
                <td className="num">{rupees(p.totalCost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">The app follows the plan that is {settings.follow === 'fastest' ? 'debt-free soonest' : 'cheapest'} and re-checks it whenever anything changes. Change this under ⚙ Plan.</p>
      </section>

      {editing && <LoanSheet loan={editing === 'new' ? undefined : editing} startMonth={settings.startMonth} onClose={() => setEditing(null)} />}
      {planOpen && <PlanSheet settings={settings} loans={loans} onClose={() => setPlanOpen(false)} />}
      {paying && row && <PaySheet month={month} rows={row.loans} loans={loans} onClose={() => setPaying(false)} />}
    </>
  )
}
