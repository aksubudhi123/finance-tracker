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
      ['05/11/26', 'ACH D- BAJAJ FINANCE LTD', '', '05/11/26', '12,000.00', '', '132881'],
      ['', '***** end of statement *****']
    ]
    const r = parseStatement(rows)
    expect(r.map((x) => [x.date, x.type, x.amount, x.category])).toEqual([
      ['2026-11-01', 'income', 120000, 'Salary'],
      ['2026-11-03', 'expense', 450, 'Eating out'],
      ['2026-11-05', 'expense', 12000, 'EMI & loans']
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

import { holderName } from './statement'
import { payeeOf } from './categorize'
import { summarise } from './summary'

describe('real-world narrations', () => {
  const own = { ownNames: ['RAVI KUMAR SHARMA'] }
  it('finds the account holder in the header', () => {
    expect(holderName([['HDFC BANK'], ['MR.     RAVI KUMAR SHARMA', '', 'Address']])).toBe('RAVI KUMAR SHARMA')
  })
  it('treats own-account moves as transfers, including names UPI cut short', () => {
    expect(guessCategory('IMPS-6244-RAVI KUMAR SHARMA-BARB-XXXX4501-', 'expense', own)).toBe('Transfer')
    expect(guessCategory('UPI-RAVI KUMAR SHARM-ravi@okaxis-BARB0VJBA-1-UPI', 'income', own)).toBe('Transfer')
    expect(guessCategory('UPI-RAVI TEA STALL-x@ybl-1-UPI', 'expense', own)).toBe('Other')
  })
  it('recognises card bills, ATM cash, loan disbursals and lender debits', () => {
    expect(guessCategory('IB BILLPAY DR-HDFCWI-552260XXXXXX6514', 'expense')).toBe('Credit card bill')
    expect(guessCategory('NWD-541919XXXXXX4588-00046624-PUNE', 'expense')).toBe('Cash withdrawal')
    expect(guessCategory('A2AINT01-C7308-BAJAJFIN DISBURSEMENT-575', 'income')).toBe('Loan received')
    expect(guessCategory('UPI-BHFL-*****BDPG@HDFCBANK-HDFC0MERUPI-63-PAY', 'expense')).toBe('EMI & loans')
  })
  it('matches whole words only', () => {
    expect(guessCategory('UPI-PARENTS GIFT-x@ybl', 'expense')).toBe('Other') // not "rent"
    expect(guessCategory('UPI-GASTRO CLINIC-x@ybl', 'expense')).toBe('Health') // not "gas"
  })
  it('remembers a chosen category per payee', () => {
    const note = 'UPI-SUNITA DEVI-98xx@ybl-SBIN001-1-PA'
    expect(payeeOf(note)).toBe('sunita devi')
    expect(guessCategory(note, 'expense', { rules: { 'expense:sunita devi': 'Groceries' } })).toBe('Groceries')
    expect(payeeOf('NEFT CR-ICIC0000105-ACME PRIVATE LIMITED-RAVI')).toBe('acme private limited')
  })
  it('leaves transfers out of income and spending', () => {
    const s = summarise('2026-11', [
      { date: '2026-11-01', type: 'income', amount: 500, category: 'Transfer' },
      { date: '2026-11-01', type: 'expense', amount: 200, category: 'Groceries' }
    ], [], [])
    expect([s.income, s.expense]).toEqual([0, 200])
  })
})
