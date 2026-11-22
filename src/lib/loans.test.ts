import { describe, expect, it } from 'vitest'
import { compare, simulate, type LoanInput, type PlanInput } from './loans'

// Made-up loans: two charged personal loans (one part-payment a year, max 20%, 4% + 18% GST,
// 6% to close in full) and two free home loans.
const loans: LoanInput[] = [
  { id: 1, name: 'PL A', outstanding: 400000, ratePct: 12, emi: 13000, maxPrepayPct: 20, prepaysPerYear: 1, prepayYearStart: 4, chargePct: 4, gstPct: 18, canCloseFull: true, closeChargePct: 6, plannedMonth: 10 },
  { id: 2, name: 'PL B', outstanding: 1200000, ratePct: 10.5, emi: 26000, maxPrepayPct: 20, prepaysPerYear: 1, prepayYearStart: 4, chargePct: 4, gstPct: 18, canCloseFull: true, closeChargePct: 6, plannedMonth: 11 },
  { id: 3, name: 'HL top-up', outstanding: 600000, ratePct: 9.5, emi: 7000, canCloseFull: true },
  { id: 4, name: 'HL', outstanding: 2000000, ratePct: 9, emi: 19000, canCloseFull: true }
]
const plan: PlanInput = {
  startMonth: '2026-11', budget: 80000, yearlyIncreasePct: 5, redirectClosedEmis: true, useReserve: true, reserveRatePct: 3,
  extras: [{ amount: 40000, month: '2026-12', every: 3 }, { amount: 80000, month: '2027-11', every: 12 }],
  payments: [{ loanId: 3, month: '2026-11', amount: 57000 }]
}
const nper = (P: number, ratePct: number, emi: number) => { const r = ratePct / 1200; return Math.ceil(-Math.log(1 - (r * P) / emi) / Math.log(1 + r)) }
const addMonths = (k: string, n: number) => { const [y, m] = k.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }

describe('loan engine', () => {
  it('pays EMIs only on the baseline, closing each loan when the formula says', () => {
    const b = simulate(loans, plan, 'emi-only')
    for (const l of loans) expect(b.closes[l.id]).toBe(addMonths('2026-11', nper(l.outstanding, l.ratePct, l.emi) - 1))
    const paid = b.months.reduce((s, m) => s + m.loans.reduce((a, x) => a + x.emi, 0), 0)
    expect(b.totalInterest).toBeCloseTo(paid - loans.reduce((s, l) => s + l.outstanding, 0), 0)
    expect(b.months[0].loans.find((x) => x.loanId === 3)!.prepay).toBe(0) // logged payments ignored on the baseline
  })

  it('applies a logged payment and sends the month’s surplus nowhere else', () => {
    const r = simulate(loans, plan, 'no-charge-first')
    const m0 = r.months[0].loans.find((x) => x.loanId === 3)!
    expect(m0.interest).toBeCloseTo(600000 * 0.095 / 12, 2)
    expect(m0.prepay).toBe(50000) // 57,000 paid - 7,000 EMI
    expect(m0.closing).toBeCloseTo(600000 + m0.interest - 7000 - 50000, 2)
    // Dec: surplus (80,000 - 65,000 EMIs) + 40,000 quarterly all to the highest-rate free loan
    const d = r.months[1].loans
    expect(d.find((x) => x.loanId === 3)!.prepay).toBeCloseTo(55000, 2)
    expect(d.find((x) => x.loanId === 1)!.prepay + d.find((x) => x.loanId === 2)!.prepay).toBe(0)
  })

  it('respects the yearly cap, planned month and charge on part-payments', () => {
    const r = simulate(loans, plan, 'highest-rate')
    const prepays = r.months.flatMap((m) => m.loans.filter((x) => x.loanId === 1 && x.prepay > 0 && !x.closedInFull).map((x) => ({ ...x, month: m.month })))
    expect(prepays.length).toBeGreaterThan(0)
    for (const p of prepays) {
      expect(p.month.endsWith('-10')).toBe(true)
      expect(p.prepay).toBeLessThanOrEqual(p.opening * 0.2 + 0.01)
      expect(p.charge).toBeCloseTo(p.prepay * 0.0472, 1)
    }
  })

  it('closes charged loans in full and beats paying EMIs only', () => {
    const c = compare(loans, plan)
    expect(c.best.debtFreeMonth! < c.baseline.debtFreeMonth!).toBe(true)
    expect(c.best.totalCost).toBeLessThan(c.baseline.totalCost / 2)
    const ncf = c.plans.find((p) => p.strategy === 'no-charge-first')!
    expect(ncf.months.some((m) => m.loans.some((x) => x.closedInFull))).toBe(true)
    for (const p of c.plans) expect(p.months.at(-1)!.totalOutstanding).toBe(0)
  })
})
