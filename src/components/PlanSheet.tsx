import { useState } from 'react'
import { db, setSetting, type Loan } from '../lib/db'
import type { DebtSettings } from '../lib/debt'
import { monthLabel, rupees } from '../lib/format'
import { toast } from '../lib/toast'
import type { ExtraRule } from '../lib/loans'

const EVERY: Record<number, string> = { 0: 'Once', 1: 'Every month', 3: 'Every 3 months', 6: 'Every 6 months', 12: 'Every year' }

export default function PlanSheet({ settings, loans, onClose }: { settings: DebtSettings; loans: Loan[]; onClose: () => void }) {
  const emis = loans.reduce((a, l) => a + l.emi, 0)
  const [budget, setBudget] = useState(String(settings.budget || emis))
  const [inc, setInc] = useState(String(settings.yearlyIncreasePct ?? 0))
  const [follow, setFollow] = useState(settings.follow)
  const [reserve, setReserve] = useState(settings.useReserve !== false)
  const [extras, setExtras] = useState<ExtraRule[]>(settings.extras ?? [])
  const [nx, setNx] = useState({ amount: '', month: new Date().toISOString().slice(0, 7), every: '0', loanId: '' })
  const b = parseFloat(budget) || 0

  async function save() {
    await setSetting('debtPlan', { ...settings, budget: b, yearlyIncreasePct: parseFloat(inc) || 0, follow, useReserve: reserve, extras })
    toast('Plan saved'); onClose()
  }
  function addExtra() {
    const amount = parseFloat(nx.amount)
    if (!(amount > 0) || !nx.month) return
    setExtras([...extras, { amount, month: nx.month, every: +nx.every, loanId: nx.loanId ? +nx.loanId : undefined }])
    setNx({ ...nx, amount: '' })
  }
  const loanName = (id?: number) => (id == null ? 'Best loan (automatic)' : loans.find((l) => l.id === id)?.name ?? 'Removed loan')

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Payoff plan settings" onClick={(e) => e.stopPropagation()}>
        <h2>Payoff plan</h2>
        <div className="row2">
          <label className="field">Monthly amount for loans, EMIs + extra (₹)<input inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^0-9]/g, ''))} /></label>
          <label className="field">Raise it every year by (%)<input inputMode="decimal" value={inc} onChange={(e) => setInc(e.target.value)} /></label>
        </div>
        <p className="muted small">EMIs add up to {rupees(emis)}, so {b > emis ? <><b>{rupees(b - emis)}</b> a month goes to prepayments.</> : 'nothing extra goes to prepayments yet.'}</p>
        <label className="field">Which plan to follow
          <select value={follow} onChange={(e) => setFollow(e.target.value as DebtSettings['follow'])}>
            <option value="fastest">Debt-free soonest (lowest cost breaks a tie)</option>
            <option value="cheapest">Lowest total interest + charges</option>
          </select>
        </label>
        <label className="check"><input type="checkbox" checked={reserve} onChange={(e) => setReserve(e.target.checked)} />
          Keep money no loan can take this month in savings, and use it later (e.g. to close a personal loan in full)</label>

        <h2>Extra money</h2>
        <p className="muted small">Bonuses, quarterly incentives or any lump sum you'll put towards loans, on top of the monthly amount.</p>
        <ul className="extras">
          {extras.map((e, i) => (
            <li key={i}>
              <span><b>{rupees(e.amount)}</b> · {EVERY[e.every ?? 0] ?? `Every ${e.every} months`} from {monthLabel(e.month)} → {loanName(e.loanId)}</span>
              <button className="link" aria-label="Remove" onClick={() => setExtras(extras.filter((_, j) => j !== i))}>✕</button>
            </li>
          ))}
          {!extras.length && <li className="muted small">None yet.</li>}
        </ul>
        <div className="row3">
          <label className="field">Amount (₹)<input inputMode="numeric" value={nx.amount} onChange={(e) => setNx({ ...nx, amount: e.target.value.replace(/[^0-9]/g, '') })} /></label>
          <label className="field">From month<input type="month" value={nx.month} onChange={(e) => setNx({ ...nx, month: e.target.value })} /></label>
          <label className="field">How often<select value={nx.every} onChange={(e) => setNx({ ...nx, every: e.target.value })}>{Object.entries(EVERY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        </div>
        <div className="row">
          <select className="text-input" aria-label="Send it to" value={nx.loanId} onChange={(e) => setNx({ ...nx, loanId: e.target.value })}>
            <option value="">Best loan (automatic)</option>
            {loans.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <button className="btn ghost" disabled={!(parseFloat(nx.amount) > 0)} onClick={addExtra}>Add</button>
        </div>
        <div className="row end">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={save}>Save plan</button>
        </div>
      </div>
    </div>
  )
}

export async function clearLoans() {
  await db.transaction('rw', db.loans, db.loanPayments, async () => { await db.loans.clear(); await db.loanPayments.clear() })
}
