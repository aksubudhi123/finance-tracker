import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { readPlanner } from './excelImport'

const d = (y: number, m: number) => new Date(y, m - 1, 1)
function book() {
  const wb = XLSX.utils.book_new()
  const add = (name: string, cells: Record<string, unknown>) => {
    const ws: XLSX.WorkSheet = {}
    for (const [a, v] of Object.entries(cells)) ws[a] = { v, t: typeof v === 'number' ? 'n' : v instanceof Date ? 'd' : 's' }
    ws['!ref'] = 'A1:S310'
    XLSX.utils.book_append_sheet(wb, ws, name)
  }
  add('Loans', {
    B3: d(2026, 11),
    A6: 'Personal loan', B6: 'Bank X', C6: d(2026, 11), D6: 500000, E6: 0.111, F6: 12000, H6: 0.2, I6: 1, J6: 4, K6: 'Yes', L6: 0.04, M6: 0.18, O6: 0.06,
    A7: 'Home loan', B7: 'Bank Y', C7: d(2026, 11), D7: 2500000, E7: 0.092, F7: 22000, K7: 'Yes', L7: 0, M7: 0, O7: 0
  })
  add('Scenarios', { B8: 100000, B9: 0.08, B10: 'Yes', B11: 'Yes', B12: 0.03, B24: 10 })
  add('This Month', { D4: 'Auto: fastest' })
  add('Prepayment Plan', {
    A5: 'A', B5: 'Auto (by method)', C5: 'One Time', D5: 200000, E5: d(2027, 6), G5: 'EXAMPLE (not used)',
    A6: 'All', B6: 'Auto (by method)', C6: 'Quarterly', D6: 50000, E6: d(2026, 12),
    A7: 'All', B7: 'Home loan', C7: 'Yearly', D7: 100000, E7: d(2027, 11)
  })
  add('Extra Money', { A5: d(2027, 3), B5: 300000, C5: 'EXAMPLE', A6: d(2026, 11), B6: 75000 })
  add('Payment Log', { A7: d(2026, 11), J7: 12000, K7: 90000, A8: d(2026, 12) })
  return wb
}

describe('Excel planner import', () => {
  it('reads loans, plan settings, extra money and logged payments', () => {
    const r = readPlanner(book())
    expect(r.loans.map((l) => [l.name, l.ratePct, l.maxPrepayPct, l.chargePct, l.gstPct, l.plannedMonth, l.canCloseFull])).toEqual([
      ['Personal loan', 11.1, 20, 4, 18, 10, true],
      ['Home loan', 9.2, undefined, 0, 0, undefined, true]
    ])
    expect(r.settings).toMatchObject({ startMonth: '2026-11', budget: 100000, yearlyIncreasePct: 8, reserveRatePct: 3, follow: 'fastest' })
    expect(r.settings.extras).toEqual([
      { amount: 50000, month: '2026-12', every: 3, until: undefined, loanId: undefined },
      { amount: 100000, month: '2027-11', every: 12, until: undefined, loanId: -2 },
      { amount: 75000, month: '2026-11', every: 0 }
    ])
    expect(r.payments).toEqual([{ slot: 0, month: '2026-11', amount: 12000 }, { slot: 1, month: '2026-11', amount: 90000 }])
  })
  it('rejects a workbook without loans', () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['x']]), 'Loans')
    expect(() => readPlanner(wb)).toThrow(/start month/)
  })
})
