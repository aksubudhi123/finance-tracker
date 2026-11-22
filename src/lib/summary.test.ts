import { describe, expect, it } from 'vitest'
import { summarise } from './summary'
import { db, exportBackup, importBackup } from './db'

describe('summarise', () => {
  it('totals only the chosen month', () => {
    const s = summarise(
      '2026-11',
      [
        { date: '2026-11-01', type: 'income', amount: 100000, category: 'Salary' },
        { date: '2026-11-05', type: 'expense', amount: 4000, category: 'Groceries' },
        { date: '2026-11-09', type: 'expense', amount: 1500, category: 'Eating out' },
        { date: '2026-10-30', type: 'expense', amount: 9999, category: 'Groceries' }
      ],
      [{ category: 'Groceries', monthlyLimit: 10000 }],
      [{ name: 'L', lender: 'X', outstanding: 500000, ratePct: 11.1, emi: 12000, startMonth: '2026-11' }]
    )
    expect(s).toEqual({
      income: 100000, expense: 5500, balance: 94500,
      budgetTotal: 10000, budgetUsed: 4000, totalDebt: 500000, totalEmi: 12000
    })
  })
})

describe('backup', () => {
  it('round-trips data and rejects other files', async () => {
    await db.transactions.add({ date: '2026-11-02', type: 'expense', amount: 250, category: 'Other' })
    const backup = await exportBackup()
    await db.transactions.clear()
    await importBackup(JSON.parse(JSON.stringify(backup)))
    expect(await db.transactions.count()).toBe(1)
    expect(await db.categories.count()).toBeGreaterThan(5)
    await expect(importBackup({ hello: 1 })).rejects.toThrow()
  })
})
