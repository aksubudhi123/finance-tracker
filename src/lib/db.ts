import Dexie, { type EntityTable } from 'dexie'

// All data lives on this device (IndexedDB). Nothing is sent to a server.

export type TxType = 'income' | 'expense'

export interface Transaction {
  id?: number
  date: string // YYYY-MM-DD
  type: TxType
  amount: number // rupees
  category: string
  note?: string
  account?: string
}

export interface Category {
  id?: number
  name: string
  type: TxType | 'both'
  icon: string
}

export interface Budget {
  id?: number
  category: string
  monthlyLimit: number
}

export interface Loan {
  id?: number
  name: string
  lender: string
  outstanding: number
  ratePct: number // % per year, e.g. 9.97
  emi: number
  startMonth: string // YYYY-MM
}

export interface LoanPayment {
  id?: number
  loanId: number
  month: string // YYYY-MM
  amount: number
}

/** Remembered category for a payee, key = "<type>:<payee>". */
export interface Rule {
  key: string
  category: string
}

export interface Setting {
  key: string
  value: unknown
}

export class FinanceDB extends Dexie {
  transactions!: EntityTable<Transaction, 'id'>
  categories!: EntityTable<Category, 'id'>
  budgets!: EntityTable<Budget, 'id'>
  loans!: EntityTable<Loan, 'id'>
  loanPayments!: EntityTable<LoanPayment, 'id'>
  rules!: EntityTable<Rule, 'key'>
  settings!: EntityTable<Setting, 'key'>

  constructor() {
    super('finance-tracker')
    this.version(1).stores({
      transactions: '++id, date, type, category',
      categories: '++id, &name, type',
      budgets: '++id, &category',
      loans: '++id, name',
      loanPayments: '++id, loanId, month, [loanId+month]'
    })
    this.version(2).stores({ rules: '&key', settings: '&key' }).upgrade(async (tx) => {
      const cats = tx.table('categories')
      for (const c of NEW_IN_V2) if (!(await cats.where('name').equals(c.name).count())) await cats.add(c)
    })
    this.on('populate', (tx) => {
      tx.table('categories').bulkAdd(DEFAULT_CATEGORIES)
    })
  }
}

export const DEFAULT_CATEGORIES: Category[] = [
  { name: 'Salary', type: 'income', icon: '💼' },
  { name: 'Other income', type: 'income', icon: '➕' },
  { name: 'Groceries', type: 'expense', icon: '🛒' },
  { name: 'Rent & housing', type: 'expense', icon: '🏠' },
  { name: 'Bills & utilities', type: 'expense', icon: '💡' },
  { name: 'Transport & fuel', type: 'expense', icon: '⛽' },
  { name: 'Eating out', type: 'expense', icon: '🍽️' },
  { name: 'Shopping', type: 'expense', icon: '🛍️' },
  { name: 'Health', type: 'expense', icon: '💊' },
  { name: 'Education', type: 'expense', icon: '📚' },
  { name: 'EMI & loans', type: 'expense', icon: '🏦' },
  { name: 'Entertainment', type: 'expense', icon: '🎬' },
  { name: 'Investments', type: 'expense', icon: '📈' },
  { name: 'Credit card bill', type: 'expense', icon: '💳' },
  { name: 'Cash withdrawal', type: 'expense', icon: '🏧' },
  { name: 'Loan received', type: 'income', icon: '🏦' },
  { name: 'Other', type: 'expense', icon: '📦' },
  { name: 'Transfer', type: 'both', icon: '🔁' }
]

const NEW_IN_V2 = DEFAULT_CATEGORIES.filter((c) =>
  ['Investments', 'Transfer', 'Credit card bill', 'Cash withdrawal', 'Loan received'].includes(c.name))

export const db = new FinanceDB()

const TABLES = ['transactions', 'categories', 'budgets', 'loans', 'loanPayments', 'rules', 'settings'] as const

export interface Backup {
  app: 'finance-tracker'
  version: 1
  exportedAt: string
  data: Record<(typeof TABLES)[number], unknown[]>
}

export async function exportBackup(): Promise<Backup> {
  const data = {} as Backup['data']
  for (const t of TABLES) data[t] = await db.table(t).toArray()
  return { app: 'finance-tracker', version: 1, exportedAt: new Date().toISOString(), data }
}

export async function importBackup(backup: unknown): Promise<void> {
  const b = backup as Partial<Backup>
  if (!b || b.app !== 'finance-tracker' || !b.data) throw new Error('This is not a Finance Tracker backup file.')
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      await db.table(t).clear()
      const rows = b.data![t]
      if (Array.isArray(rows)) await db.table(t).bulkAdd(rows)
    }
  })
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  return ((await db.settings.get(key))?.value as T) ?? fallback
}

export const setSetting = (key: string, value: unknown) => db.settings.put({ key, value })

/** Narrations of our own accounts are transfers, not income or spending. */
export const counts = (t: { category: string }) => t.category !== 'Transfer'
