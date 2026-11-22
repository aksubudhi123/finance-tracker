import { describe, expect, it } from 'vitest'
import { findRecurring, health, monthTotals, recentWindow, tips } from './insights'
import type { Transaction } from './db'

const tx = (date: string, type: 'income' | 'expense', amount: number, category: string, note?: string): Transaction => ({ date, type, amount, category, note })
const data: Transaction[] = []
for (const m of ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11']) {
  data.push(tx(`${m}-01`, 'income', 100000, 'Salary'))
  data.push(tx(`${m}-02`, 'income', 50000, 'Transfer'))
  data.push(tx(`${m}-05`, 'expense', 40000, 'EMI & loans'))
  data.push(tx(`${m}-07`, 'expense', 8000, 'Groceries'))
  data.push(tx(`${m}-09`, 'expense', m >= '2026-09' ? 9000 : 5000, 'Eating out'))
  data.push(tx(`${m}-10`, 'expense', 649, 'Entertainment', 'UPI-NETFLIX COM-x@icici-1-UPI'))
  data.push(tx(`${m}-12`, 'expense', 30000, 'Transfer'))
}

describe('insights', () => {
  it('leaves transfers out and uses complete months', () => {
    const mt = monthTotals(data)
    expect(mt[0]).toMatchObject({ income: 100000, spend: 53649 })
    expect(recentWindow(mt, '2026-11').recent.map((m) => m.month)).toEqual(['2026-08', '2026-09', '2026-10'])
  })
  it('computes savings rate, EMI load and emergency cover', () => {
    const h = health(data, '2026-11', 40000, 120000)
    expect(h.emiLoad).toBeCloseTo(0.4)
    expect(h.essentials).toBe(48000)
    expect(h.emergencyMonths).toBe(2.5)
    expect(h.savingsRate).toBeCloseTo((100000 - (40000 + 8000 + 649 + (5000 + 9000 + 9000) / 3)) / 100000)
  })
  it('finds repeating payments', () => {
    expect(findRecurring(data).map((r) => [r.payee, r.amount, r.months])).toContainEqual(['netflix com', 649, 5])
  })
  it('puts urgent tips first and spots rising categories', () => {
    const t = tips(health(data, '2026-11', 40000, 120000), findRecurring(data), true)
    expect(t[0].level).toBe('act')
    expect(t.map((x) => x.id)).toEqual(expect.arrayContaining(['emi', 'ef', 'cut-Eating out', 'recurring', 'tax']))
    expect(t.find((x) => x.id === 'cut-Eating out')!.cut).toBe(1500)
  })
  it('gives no tips without data', () => {
    expect(tips(health([], '2026-11', 0, null), [], false)).toEqual([])
  })
})
