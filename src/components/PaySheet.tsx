import { useState } from 'react'
import { db, type Loan } from '../lib/db'
import type { LoanMonth } from '../lib/loans'
import { monthLabel, rupees } from '../lib/format'
import { toast } from '../lib/toast'

/** Log what was actually paid to each lender this month (EMI + extra + any charge). */
export default function PaySheet({ month, rows, loans, onClose }: { month: string; rows: LoanMonth[]; loans: Loan[]; onClose: () => void }) {
  const planned = (r: LoanMonth) => Math.round((r.emi + r.prepay + r.charge) * 100) / 100
  const [vals, setVals] = useState<Record<number, string>>(() => Object.fromEntries(rows.map((r) => [r.loanId, String(planned(r))])))
  const name = (id: number) => loans.find((l) => l.id === id)?.name ?? ''
  async function save() {
    await db.transaction('rw', db.loanPayments, async () => {
      for (const r of rows) {
        await db.loanPayments.where('[loanId+month]').equals([r.loanId, month]).delete()
        const v = parseFloat(vals[r.loanId])
        if (v >= 0 && vals[r.loanId] !== '') await db.loanPayments.add({ loanId: r.loanId, month, amount: v })
      }
    })
    toast('Payments logged. Your plan has been updated.'); onClose()
  }
  async function clear() {
    await db.loanPayments.where('month').equals(month).delete()
    toast('Log cleared'); onClose()
  }
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Log payments" onClick={(e) => e.stopPropagation()}>
        <h2>What did you pay in {monthLabel(month)}?</h2>
        <p className="muted small">Total paid to each lender (EMI + extra + any charge). Paid something different from the plan? Type the real amount, and every future month is worked out again from it.</p>
        <ul className="budget-edit">
          {rows.map((r) => (
            <li key={r.loanId}>
              <span>{name(r.loanId)}<br /><span className="muted small">Plan: {rupees(planned(r))}</span></span>
              <label className="money-input"><span>₹</span>
                <input inputMode="decimal" aria-label={`${name(r.loanId)} paid`} value={vals[r.loanId] ?? ''}
                  onChange={(e) => setVals({ ...vals, [r.loanId]: e.target.value.replace(/[^0-9.]/g, '') })} />
              </label>
            </li>
          ))}
        </ul>
        <div className="row end">
          {rows.some((r) => r.logged) && <button className="btn danger ghost" onClick={clear}>Clear log</button>}
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  )
}
