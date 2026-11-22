import { describe, expect, it } from 'vitest'
import { parseDate, parseStatement } from './statement'
import { budgetStatus, crossingAlert, lastMonths } from './budget'
import { guessCategory } from './categorize'

describe('statement import', () => {
  it('reads an HDFC-style withdrawal/deposit statement', () => {
    const rows = [
      ['HDFC BANK Ltd.'], [''],
      ['Date', 'Narration', 'Chq./Ref.No.', 'Value Dt', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance'],
      ['01/11/26', 'SALARY NOV ACME LTD', '', '01/11/26', '', '1,20,000.00', '150000'],
      ['03/11/26', 'UPI-SWIGGY-swiggy@icici', '', '03/11/26', '450.00', '', '149550'],
      ['05/11/26', 'ACH D- BAJAJ FINANCE LTD', '', '05/11/26', '16,669.00', '', '132881'],
      ['', '***** end of statement *****']
    ]
    const r = parseStatement(rows)
    expect(r.map((x) => [x.date, x.type, x.amount, x.category])).toEqual([
      ['2026-11-01', 'income', 120000, 'Salary'],
      ['2026-11-03', 'expense', 450, 'Eating out'],
      ['2026-11-05', 'expense', 16669, 'EMI & loans']
    ])
  })

  it('reads a single amount column with Dr/Cr and flags duplicates', () => {
    const rows = [
      ['Txn Date', 'Description', 'Amount', 'Dr / Cr'],
      ['12 Nov 2026', 'AMAZON PAY', '999', 'DR'],
      ['13-Nov-2026', 'REFUND', '120', 'CR']
    ]
    const r = parseStatement(rows, [{ date: '2026-11-12', type: 'expense', amount: 999, category: 'Shopping' }])
    expect(r[0]).toMatchObject({ type: 'expense', category: 'Shopping', duplicate: true })
    expect(r[1]).toMatchObject({ type: 'income', date: '2026-11-13', duplicate: false })
  })

  it('explains when the columns cannot be found', () => {
    expect(() => parseStatement([['a', 'b']])).toThrow(/columns/)
  })

  it('parses common date formats', () => {
    expect(parseDate('5/1/2027')).toBe('2027-01-05')
    expect(parseDate(46350)).toBe('2026-11-24')
    expect(parseDate('2026-11-02 10:00')).toBe('2026-11-02')
    expect(parseDate('hello')).toBeNull()
  })
})

describe('budgets', () => {
  const txs = [
    { date: '2026-11-02', type: 'expense' as const, amount: 7000, category: 'Groceries' },
    { date: '2026-10-02', type: 'expense' as const, amount: 9000, category: 'Groceries' }
  ]
  it('computes status for the month only', () => {
    expect(budgetStatus('2026-11', [{ category: 'Groceries', monthlyLimit: 8000 }], txs)[0]).toMatchObject({ spent: 7000, level: 'near' })
  })
  it('alerts on crossing 80% and 100%', () => {
    expect(crossingAlert('Groceries', 6000, 500, 8000)).toMatch(/81%/)
    expect(crossingAlert('Groceries', 7500, 600, 8000)).toMatch(/Over budget/)
    expect(crossingAlert('Groceries', 1000, 100, 8000)).toBeNull()
    expect(crossingAlert('Groceries', 1000, 100, undefined)).toBeNull()
  })
  it('lists months across a year boundary', () => {
    expect(lastMonths('2027-02', 4)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02'])
  })
  it('does not treat salary words as expenses', () => {
    expect(guessCategory('salary advance repayment', 'expense')).toBe('Other')
  })
})
