import type { Transaction, TxType } from './db'
import { guessCategory } from './categorize'

export interface ParsedRow extends Transaction {
  duplicate?: boolean
}

type Cell = string | number | boolean | Date | null | undefined

const norm = (c: Cell) => String(c ?? '').toLowerCase().replace(/[^a-z]/g, ' ').replace(/\s+/g, ' ').trim()

const isDateHead = (h: string) => /^(txn |transaction |value |tran )?date$|^date of transaction$|^txn date$|^tran date$/.test(h) || h === 'date'
const isDescHead = (h: string) => /narration|description|particulars|remarks|details|transaction details/.test(h)
const isDebitHead = (h: string) => /withdrawal|debit|dr amount|^dr$|paid out|amount dr/.test(h)
const isCreditHead = (h: string) => /deposit|credit|cr amount|^cr$|paid in|amount cr/.test(h)
const isAmountHead = (h: string) => /^(transaction )?amount( inr| rs)?$/.test(h)
const isDrCrHead = (h: string) => /^(dr cr|cr dr|type|debit credit)$/.test(h)

export interface Columns { date: number; desc: number; debit: number; credit: number; amount: number; drcr: number; headerRow: number }

export function findColumns(rows: Cell[][]): Columns | null {
  for (let r = 0; r < Math.min(rows.length, 60); r++) {
    const heads = rows[r].map(norm)
    const date = heads.findIndex((h) => isDateHead(h) || (h.includes('date') && !h.includes('value')))
    const desc = heads.findIndex(isDescHead)
    const debit = heads.findIndex(isDebitHead)
    const credit = heads.findIndex(isCreditHead)
    const amount = heads.findIndex(isAmountHead)
    const drcr = heads.findIndex(isDrCrHead)
    if (date >= 0 && desc >= 0 && ((debit >= 0 && credit >= 0) || amount >= 0)) {
      return { date, desc, debit, credit, amount, drcr, headerRow: r }
    }
  }
  return null
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const pad = (n: number) => String(n).padStart(2, '0')

export function parseDate(c: Cell): string | null {
  if (c instanceof Date && !isNaN(c.getTime())) return `${c.getFullYear()}-${pad(c.getMonth() + 1)}-${pad(c.getDate())}`
  if (typeof c === 'number' && c > 20000 && c < 80000) {
    // Excel serial date
    const d = new Date(Date.UTC(1899, 11, 30) + c * 86400000)
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  }
  const s = String(c ?? '').trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`
  m = s.match(/^(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d{2,4})$/) // Indian banks use day first
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]
    if (+m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) return `${y}-${pad(+m[2])}-${pad(+m[1])}`
  }
  m = s.match(/^(\d{1,2})[\s\-/]([A-Za-z]{3})[A-Za-z]*[\s\-/,]+(\d{2,4})$/)
  if (m) {
    const mi = MONTHS.indexOf(m[2].toLowerCase())
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]
    if (mi >= 0) return `${y}-${pad(mi + 1)}-${pad(+m[1])}`
  }
  return null
}

export function parseAmount(c: Cell): number {
  if (typeof c === 'number') return c
  const s = String(c ?? '').replace(/,/g, '').replace(/[₹\s]|inr|rs\.?/gi, '')
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

export function parseStatement(rows: Cell[][], existing: Transaction[] = []): ParsedRow[] {
  const cols = findColumns(rows)
  if (!cols) throw new Error("Couldn't find the Date, Description and Amount columns in this file.")
  const seen = new Set(existing.map((t) => `${t.date}|${t.amount}|${t.type}`))
  const out: ParsedRow[] = []
  for (const row of rows.slice(cols.headerRow + 1)) {
    const date = parseDate(row[cols.date])
    if (!date) continue
    let type: TxType
    let amount: number
    if (cols.debit >= 0 && cols.credit >= 0) {
      const dr = Math.abs(parseAmount(row[cols.debit]))
      const cr = Math.abs(parseAmount(row[cols.credit]))
      if (dr > 0) { type = 'expense'; amount = dr } else if (cr > 0) { type = 'income'; amount = cr } else continue
    } else {
      const raw = parseAmount(row[cols.amount])
      const flag = cols.drcr >= 0 ? norm(row[cols.drcr]) : ''
      if (!raw) continue
      type = flag.startsWith('cr') || flag.startsWith('credit') ? 'income'
        : flag.startsWith('dr') || flag.startsWith('debit') ? 'expense'
        : raw < 0 ? 'expense' : 'income'
      amount = Math.abs(raw)
    }
    const note = String(row[cols.desc] ?? '').trim().replace(/\s+/g, ' ')
    const key = `${date}|${amount}|${type}`
    out.push({ date, type, amount, note, category: guessCategory(note, type), account: 'Bank', duplicate: seen.has(key) })
  }
  return out
}

export async function readStatementFile(file: File): Promise<Cell[][]> {
  const XLSX = await import('xlsx')
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true, raw: file.name.toLowerCase().endsWith('.csv') })
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: '' })
}
