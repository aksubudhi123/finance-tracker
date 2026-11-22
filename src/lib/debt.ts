import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSetting, type Loan } from './db'
import { compare, type Comparison, type LoanInput, type PlanInput, type SimResult } from './loans'
import { monthKey } from './format'

export interface DebtSettings extends Omit<PlanInput, 'payments'> {
  follow: 'fastest' | 'cheapest'
}

export const defaultDebtSettings = (): DebtSettings => ({
  startMonth: monthKey(), budget: 0, yearlyIncreasePct: 0, redirectClosedEmis: true, useReserve: true,
  reserveRatePct: 3, extras: [], budgetChanges: [], rateChanges: [], follow: 'fastest'
})

export const toInput = (l: Loan): LoanInput => ({ ...l, id: l.id! })

export interface DebtView {
  loans: Loan[]
  settings: DebtSettings
  comparison: Comparison | null
  plan: SimResult | null
}

export function useDebt(): DebtView | undefined {
  return useLiveQuery(async () => {
    const [loans, settings, payments] = await Promise.all([
      db.loans.toArray(),
      getSetting<DebtSettings>('debtPlan', defaultDebtSettings()),
      db.loanPayments.toArray()
    ])
    if (!loans.length) return { loans, settings, comparison: null, plan: null }
    const s = { ...defaultDebtSettings(), ...settings }
    const budget = s.budget || loans.reduce((a, l) => a + l.emi, 0)
    const comparison = compare(loans.map(toInput), { ...s, budget, payments }, s.follow)
    return { loans, settings: s, comparison, plan: comparison.best }
  })
}

/** Balance of each loan at the end of the month before `month` (or the start balance). */
export function balancesBefore(plan: SimResult, loans: Loan[], month: string): Record<number, number> {
  const out: Record<number, number> = Object.fromEntries(loans.map((l) => [l.id!, l.outstanding]))
  for (const row of plan.months) {
    if (row.month >= month) break
    for (const lm of row.loans) out[lm.loanId] = lm.closing
  }
  return out
}
