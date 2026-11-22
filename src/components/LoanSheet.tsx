import { useState } from 'react'
import { db, type Loan } from '../lib/db'
import { toast } from '../lib/toast'
import { monthKey } from '../lib/format'

const MONTHS = ['Any', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function LoanSheet({ loan, startMonth, onClose }: { loan?: Loan; startMonth?: string; onClose: () => void }) {
  const [f, setF] = useState<Record<string, string>>(() => ({
    name: loan?.name ?? '', lender: loan?.lender ?? '', outstanding: s(loan?.outstanding), ratePct: s(loan?.ratePct), emi: s(loan?.emi),
    maxPrepayPct: s(loan?.maxPrepayPct), prepaysPerYear: s(loan?.prepaysPerYear), chargePct: s(loan?.chargePct), gstPct: s(loan?.gstPct ?? 18),
    closeChargePct: s(loan?.closeChargePct), plannedMonth: s(loan?.plannedMonth ?? 0), canCloseFull: loan?.canCloseFull === false ? 'no' : 'yes'
  }))
  const [more, setMore] = useState(!!(loan?.maxPrepayPct || loan?.chargePct || loan?.prepaysPerYear))
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const n = (k: string) => (f[k] === '' ? undefined : parseFloat(f[k]))
  const valid = f.name.trim() && n('outstanding')! > 0 && n('ratePct')! >= 0 && n('emi')! > 0

  async function save() {
    const row: Loan = {
      name: f.name.trim(), lender: f.lender.trim(), outstanding: n('outstanding')!, ratePct: n('ratePct')!, emi: n('emi')!,
      startMonth: loan?.startMonth ?? startMonth ?? monthKey(),
      maxPrepayPct: n('maxPrepayPct') || undefined, prepaysPerYear: n('prepaysPerYear') || undefined, prepayYearStart: loan?.prepayYearStart ?? 4,
      chargePct: n('chargePct') || undefined, gstPct: n('chargePct') ? n('gstPct') : undefined,
      canCloseFull: f.canCloseFull === 'yes', closeChargePct: n('closeChargePct') || undefined,
      plannedMonth: n('plannedMonth') || undefined, notes: loan?.notes
    }
    if (loan?.id) await db.loans.put({ ...row, id: loan.id })
    else await db.loans.add(row)
    toast('Loan saved'); onClose()
  }
  async function remove() {
    if (!loan?.id) return
    await db.transaction('rw', db.loans, db.loanPayments, async () => {
      await db.loans.delete(loan.id!)
      await db.loanPayments.where('loanId').equals(loan.id!).delete()
    })
    toast('Loan removed'); onClose()
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={loan ? 'Edit loan' : 'Add loan'} onClick={(e) => e.stopPropagation()}>
        <h2>{loan ? 'Edit loan' : 'Add a loan'}</h2>
        <div className="row2">
          <label className="field">Loan name<input value={f.name} onChange={set('name')} placeholder="e.g. Home loan" /></label>
          <label className="field">Lender<input value={f.lender} onChange={set('lender')} placeholder="e.g. SBI" /></label>
        </div>
        <div className="row3">
          <label className="field">Outstanding at plan start (₹)<input inputMode="decimal" value={f.outstanding} onChange={set('outstanding')} /></label>
          <label className="field">Interest (% a year)<input inputMode="decimal" value={f.ratePct} onChange={set('ratePct')} /></label>
          <label className="field">EMI (₹)<input inputMode="decimal" value={f.emi} onChange={set('emi')} /></label>
        </div>
        <button className="link" onClick={() => setMore(!more)}>{more ? '▾' : '▸'} Prepayment rules (limits and charges)</button>
        {more && (
          <>
            <p className="muted small">Leave blank if your lender allows any amount, any time, free. Home loans on floating rates usually have no charge.</p>
            <div className="row3">
              <label className="field">Max per year (% of balance)<input inputMode="decimal" value={f.maxPrepayPct} onChange={set('maxPrepayPct')} placeholder="No limit" /></label>
              <label className="field">Part-payments per year<input inputMode="numeric" value={f.prepaysPerYear} onChange={set('prepaysPerYear')} placeholder="No limit" /></label>
              <label className="field">Prepay in month<select value={f.plannedMonth} onChange={set('plannedMonth')}>{MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}</select></label>
            </div>
            <div className="row3">
              <label className="field">Part-payment charge (%)<input inputMode="decimal" value={f.chargePct} onChange={set('chargePct')} placeholder="0" /></label>
              <label className="field">GST on charge (%)<input inputMode="decimal" value={f.gstPct} onChange={set('gstPct')} /></label>
              <label className="field">Charge to close in full (%)<input inputMode="decimal" value={f.closeChargePct} onChange={set('closeChargePct')} placeholder="0" /></label>
            </div>
            <label className="field">Can it be closed in full early?
              <select value={f.canCloseFull} onChange={set('canCloseFull')}><option value="yes">Yes</option><option value="no">No</option></select>
            </label>
          </>
        )}
        <div className="row end">
          {loan && <button className="btn danger ghost" onClick={remove}>Remove</button>}
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={!valid} onClick={save}>Save</button>
        </div>
      </div>
    </div>
  )
}
function s(v: number | undefined) { return v == null ? '' : String(v) }
