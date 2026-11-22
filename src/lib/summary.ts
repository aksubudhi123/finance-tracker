import { counts, type Budget, type Loan, type Transaction } from './db'

export interface MonthSummary {
  income: number
  expense: number
  balance: number
  budgetTotal: number
  budgetUsed: number
  totalDebt: number
  totalEmi: number
}

export function summarise(month: string, txs: Transaction[], budgets: Budget[], loans: Loan[]): MonthSummary {
  const inMonth = txs.filter((t) => t.date.startsWith(month) && counts(t))
  const income = inMonth.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expense = inMonth.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const budgeted = new Set(budgets.map((b) => b.category))
  const budgetUsed = inMonth
    .filter((t) => t.type === 'expense' && budgeted.has(t.category))
    .reduce((s, t) => s + t.amount, 0)
  return {
    income,
    expense,
    balance: income - expense,
    budgetTotal: budgets.reduce((s, b) => s + b.monthlyLimit, 0),
    budgetUsed,
    totalDebt: loans.reduce((s, l) => s + l.outstanding, 0),
    totalEmi: loans.reduce((s, l) => s + l.emi, 0)
  }
}
