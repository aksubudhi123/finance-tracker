import type { Budget, Transaction } from './db'

export type BudgetLevel = 'ok' | 'near' | 'over'

export interface BudgetStatus { category: string; limit: number; spent: number; pct: number; level: BudgetLevel }

export const levelFor = (spent: number, limit: number): BudgetLevel =>
  spent > limit ? 'over' : spent >= limit * 0.8 ? 'near' : 'ok'

export function budgetStatus(month: string, budgets: Budget[], txs: Transaction[]): BudgetStatus[] {
  return budgets.map((b) => {
    const spent = txs
      .filter((t) => t.type === 'expense' && t.category === b.category && t.date.startsWith(month))
      .reduce((s, t) => s + t.amount, 0)
    return { category: b.category, limit: b.monthlyLimit, spent, pct: b.monthlyLimit ? (spent / b.monthlyLimit) * 100 : 0, level: levelFor(spent, b.monthlyLimit) }
  })
}

/** Message to show when adding `amount` pushes a category into a new warning level. */
export function crossingAlert(category: string, before: number, amount: number, limit: number | undefined): string | null {
  if (!limit) return null
  const a = levelFor(before, limit)
  const b = levelFor(before + amount, limit)
  if (a === b) return null
  if (b === 'over') return `Over budget: ${category} is now above its monthly limit.`
  if (b === 'near') return `Heads up: ${category} has used ${Math.round(((before + amount) / limit) * 100)}% of its budget.`
  return null
}

export function byCategory(txs: Transaction[], type: 'expense' | 'income' = 'expense') {
  const m = new Map<string, number>()
  for (const t of txs) if (t.type === type && t.category !== 'Transfer') m.set(t.category, (m.get(t.category) ?? 0) + t.amount)
  return [...m.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount)
}

export function lastMonths(endMonth: string, n: number): string[] {
  const [y, m] = endMonth.split('-').map(Number)
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1)
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}
