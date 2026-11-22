import type { WorkBook, WorkSheet } from 'xlsx'
import type { Loan } from './db'
import type { DebtSettings } from './debt'
import { defaultDebtSettings } from './debt'

// Reads the "Debt Prepayment Planner" workbook (Loans, Scenarios, Prepayment Plan, Extra Money,
// Budget Changes, Rate Changes and Payment Log sheets).

type Cell = { v?: unknown } | undefined
const cell = (ws: WorkSheet | undefined, a: string) => (ws?.[a] as Cell)?.v
const pad = (n: number) => String(n).padStart(2, '0')

export function monthOf(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    // xlsx dates can be a few seconds off midnight in local time; round to nearest day first
    const d = new Date(v.getTime() + 12 * 3600 * 1000)
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
  }
  if (typeof v === 'number' && v > 20000) {
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000)
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`
  }
  return null
}
const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !isNaN(+v) ? +v : undefined)
const pct = (v: unknown) => { const n = num(v); return n == null ? undefined : n <= 1 ? Math.round(n * 10000) / 100 : n }
const str = (v: unknown) => (v == null ? '' : String(v).trim())
const yes = (v: unknown) => /^y/i.test(str(v))
const isExample = (note: unknown) => /^example/i.test(str(note))
const EVERY: Record<string, number> = { 'one time': 0, monthly: 1, quarterly: 3, 'half-yearly': 6, yearly: 12 }
const COLS = 'ABCDEFGHIJKLMNOPQRS'

export interface PlannerImport {
  loans: (Loan & { slot: number })[]
  settings: DebtSettings
  payments: { slot: number; month: string; amount: number }[]
  warnings: string[]
}

export function isPlannerWorkbook(wb: WorkBook) {
  return wb.SheetNames.includes('Loans') && wb.SheetNames.includes('Scenarios')
}

export function readPlanner(wb: WorkBook): PlannerImport {
  const warnings: string[] = []
  const L = wb.Sheets['Loans']
  const start = monthOf(cell(L, 'B3'))
  if (!start) throw new Error("Couldn't find the plan start month on the Loans sheet (cell B3).")

  const loans: PlannerImport['loans'] = []
  for (let r = 6; r <= 11; r++) {
    const name = str(cell(L, `A${r}`))
    if (!name) continue
    const outstanding = num(cell(L, `D${r}`)), rate = pct(cell(L, `E${r}`)), emi = num(cell(L, `F${r}`))
    if (outstanding == null || rate == null || emi == null) { warnings.push(`Skipped "${name}": outstanding, rate or EMI missing.`); continue }
    loans.push({
      slot: r - 6, name, lender: str(cell(L, `B${r}`)), outstanding, ratePct: rate, emi,
      startMonth: monthOf(cell(L, `C${r}`)) ?? start,
      maxPrepayPct: pct(cell(L, `H${r}`)), prepaysPerYear: num(cell(L, `I${r}`)), prepayYearStart: num(cell(L, `J${r}`)),
      canCloseFull: yes(cell(L, `K${r}`)), chargePct: pct(cell(L, `L${r}`)), gstPct: pct(cell(L, `M${r}`)),
      closeChargePct: pct(cell(L, `O${r}`)), notes: str(cell(L, `S${r}`)) || undefined
    })
  }
  if (!loans.length) throw new Error('No loans found on the Loans sheet.')

  // Scenario column: the plan the sheet follows (A/B/C), else A.
  const follow = str(cell(wb.Sheets['This Month'], 'D4'))
  const col = /^[BC]$/.test(follow) ? follow : 'B'
  const scol = col === 'B' ? 'B' : col === 'C' ? 'C' : 'D'
  const scenarioCode = { B: 'A', C: 'B', D: 'C' }[scol]!
  const S = wb.Sheets['Scenarios']
  const settings: DebtSettings = {
    ...defaultDebtSettings(),
    startMonth: start,
    budget: num(cell(S, `${scol}8`)) ?? loans.reduce((a, l) => a + l.emi, 0),
    yearlyIncreasePct: pct(cell(S, `${scol}9`)) ?? 0,
    redirectClosedEmis: !/^n/i.test(str(cell(S, `${scol}10`))),
    useReserve: !/^n/i.test(str(cell(S, `${scol}11`))),
    reserveRatePct: pct(cell(S, `${scol}12`)) ?? 0,
    follow: /lowest cost/i.test(follow) ? 'cheapest' : 'fastest'
  }
  for (const l of loans) {
    const m = num(cell(S, `${scol}${24 + l.slot}`))
    if (m) l.plannedMonth = m
  }
  const bySlotName = (name: string) => loans.find((l) => l.name.toLowerCase() === name.toLowerCase())
  const appliesTo = (sc: string) => !sc || /^all$/i.test(sc) || sc.toUpperCase() === scenarioCode

  const P = wb.Sheets['Prepayment Plan']
  for (let r = 5; r <= 40 && P; r++) {
    if (isExample(cell(P, `G${r}`)) || !appliesTo(str(cell(P, `A${r}`)))) continue
    const amount = num(cell(P, `D${r}`)), month = monthOf(cell(P, `E${r}`))
    if (!amount || !month) continue
    const target = str(cell(P, `B${r}`))
    const loan = /^auto/i.test(target) || !target ? undefined : bySlotName(target)
    settings.extras!.push({
      amount, month, every: EVERY[str(cell(P, `C${r}`)).toLowerCase()] ?? 0,
      until: monthOf(cell(P, `F${r}`)) ?? undefined, loanId: loan ? -(loan.slot + 1) : undefined
    })
  }
  const X = wb.Sheets['Extra Money']
  for (let r = 5; r <= 70 && X; r++) {
    if (isExample(cell(X, `C${r}`))) continue
    const amount = num(cell(X, `B${r}`)), month = monthOf(cell(X, `A${r}`))
    if (amount && month) settings.extras!.push({ amount, month, every: 0 })
  }
  const B = wb.Sheets['Budget Changes']
  for (let r = 5; r <= 30 && B; r++) {
    if (isExample(cell(B, `D${r}`)) || !appliesTo(str(cell(B, `A${r}`)))) continue
    const amount = num(cell(B, `B${r}`)), month = monthOf(cell(B, `C${r}`))
    if (amount && month) settings.budgetChanges!.push({ amount, month })
  }
  const R = wb.Sheets['Rate Changes']
  for (let r = 5; r <= 30 && R; r++) {
    if (isExample(cell(R, `E${r}`)) || !appliesTo(str(cell(R, `A${r}`)))) continue
    const loan = bySlotName(str(cell(R, `B${r}`))), rate = pct(cell(R, `C${r}`)), month = monthOf(cell(R, `D${r}`))
    if (loan && rate != null && month) settings.rateChanges!.push({ loanId: -(loan.slot + 1), ratePct: rate, month })
  }
  // Payment Log: actual amounts typed in columns J.. (one per loan slot)
  const G = wb.Sheets['Payment Log']
  const payments: PlannerImport['payments'] = []
  for (let r = 7; r <= 310 && G; r++) {
    const month = monthOf(cell(G, `A${r}`))
    if (!month) continue
    for (const l of loans) {
      const v = num(cell(G, `${COLS[9 + l.slot]}${r}`))
      if (v != null) payments.push({ slot: l.slot, month, amount: v })
    }
  }
  return { loans, settings, payments, warnings }
}
