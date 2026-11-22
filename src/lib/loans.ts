// Debt payoff engine: month-by-month simulation of loans with EMIs, prepayment rules,
// a monthly budget, extra money and a reserve account. Mirrors the Debt Prepayment Planner workbook.

export interface LoanInput {
  id: number
  name: string
  lender?: string
  outstanding: number // at plan start, before that month's EMI
  ratePct: number // % p.a.
  emi: number
  startMonth?: string // YYYY-MM of first modelled EMI (default: plan start)
  maxPrepayPct?: number // max part-payment per year as % of outstanding (blank = no limit)
  prepaysPerYear?: number // part-payments allowed per year (blank = no limit)
  prepayYearStart?: number // month 1-12 the prepayment year starts (4 = Apr-Mar)
  chargePct?: number // part-payment charge %
  gstPct?: number // GST on the charge %
  canCloseFull?: boolean
  closeChargePct?: number // all-in % of outstanding to close in full
  plannedMonth?: number // 1-12: month a limited loan is part-paid in
}

export type Strategy = 'highest-rate' | 'after-charges' | 'no-charge-first' | 'smallest-balance'
export const STRATEGIES: { id: Strategy; label: string; text: string }[] = [
  { id: 'no-charge-first', label: 'Free prepayments first', text: 'Extra money goes to loans you can prepay without charges, highest rate first. Charged loans are closed in full once those are gone.' },
  { id: 'highest-rate', label: 'Highest rate first', text: 'Extra money goes to the highest-rate loan it can, ignoring charges.' },
  { id: 'after-charges', label: 'Rate after charges first', text: 'Like highest rate, but a loan’s charge is counted against its rate.' },
  { id: 'smallest-balance', label: 'Smallest balance first', text: 'Close the smallest loan first (the “snowball”). Feels good, usually costs more.' }
]

export interface ExtraRule { amount: number; month: string; every?: number; until?: string; loanId?: number } // every: months between (0/undefined = once)
export interface PlanInput {
  startMonth: string
  budget: number // EMIs + extra per month
  yearlyIncreasePct?: number
  budgetChanges?: { month: string; amount: number }[]
  redirectClosedEmis?: boolean
  useReserve?: boolean
  reserveRatePct?: number
  extras?: ExtraRule[]
  rateChanges?: { loanId: number; month: string; ratePct: number }[]
  payments?: { loanId: number; month: string; amount: number }[] // total actually paid to lender
}

export interface LoanMonth {
  loanId: number
  opening: number
  interest: number
  emi: number
  prepay: number // principal prepaid
  charge: number
  closing: number
  logged: boolean
  closedInFull: boolean
}

export interface MonthRow {
  month: string
  budget: number
  pool: number
  loans: LoanMonth[]
  reserveIn: number
  reserveOut: number
  reserveEnd: number
  totalOutstanding: number
}

export interface SimResult {
  strategy: Strategy | 'emi-only'
  months: MonthRow[]
  debtFreeMonth: string | null
  totalInterest: number
  totalCharges: number
  reserveInterest: number
  totalCost: number
  closes: Record<number, string>
  interestByLoan: Record<number, number>
}

export const mIndex = (k: string) => { const [y, m] = k.split('-').map(Number); return y * 12 + m - 1 }
export const mKey = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`
const r2 = (n: number) => Math.round(n * 100) / 100
const EPS = 0.005

export const effCharge = (l: LoanInput) => ((l.chargePct ?? 0) / 100) * (1 + (l.gstPct ?? 0) / 100)
export const isLimited = (l: LoanInput) => !!(l.maxPrepayPct || l.prepaysPerYear || effCharge(l) > 0 || l.plannedMonth)

function budgetFor(plan: PlanInput, i: number, start: number) {
  const changes = (plan.budgetChanges ?? []).map((c) => ({ i: mIndex(c.month), a: c.amount })).filter((c) => c.i <= i).sort((a, b) => a.i - b.i)
  const last = changes.at(-1)
  const base = last ? last.a : plan.budget
  const from = last ? last.i : start
  const inc = (plan.yearlyIncreasePct ?? 0) / 100
  return r2(base * Math.pow(1 + inc, Math.floor((i - from) / 12)))
}

function extrasFor(plan: PlanInput, i: number) {
  let auto = 0
  const direct: Record<number, number> = {}
  for (const e of plan.extras ?? []) {
    const s = mIndex(e.month)
    if (i < s || (e.until && i > mIndex(e.until))) continue
    if (e.every ? (i - s) % e.every !== 0 : i !== s) continue
    if (e.loanId != null) direct[e.loanId] = (direct[e.loanId] ?? 0) + e.amount
    else auto += e.amount
  }
  return { auto, direct }
}

export function simulate(loans: LoanInput[], plan: PlanInput, strategy: Strategy | 'emi-only', horizon = 300): SimResult {
  const start = mIndex(plan.startMonth)
  const bal: Record<number, number> = {}
  const rate: Record<number, number> = {}
  const fyCount: Record<number, number> = {}
  const fyKey: Record<number, number> = {}
  for (const l of loans) { bal[l.id] = l.outstanding; rate[l.id] = l.ratePct }
  const closes: Record<number, string> = {}
  const interestByLoan: Record<number, number> = {}
  const months: MonthRow[] = []
  let reserve = 0, totalInterest = 0, totalCharges = 0, reserveInterest = 0
  const payIdx = new Map<string, number>()
  for (const p of strategy === 'emi-only' ? [] : plan.payments ?? []) payIdx.set(`${p.loanId}|${p.month}`, (payIdx.get(`${p.loanId}|${p.month}`) ?? 0) + p.amount)
  const closedEmis = () => loans.filter((l) => bal[l.id] <= EPS).reduce((s, l) => s + l.emi, 0)

  for (let i = start; i < start + horizon; i++) {
    const month = mKey(i)
    const cm = (i % 12) + 1
    for (const rc of (plan.rateChanges ?? [])) if (mIndex(rc.month) === i) rate[rc.loanId] = rc.ratePct
    const open = loans.filter((l) => bal[l.id] > EPS && mIndex(l.startMonth ?? plan.startMonth) <= i)
    if (!open.length && loans.every((l) => bal[l.id] <= EPS)) break

    // 1. Interest and EMIs
    const rows: Record<number, LoanMonth> = {}
    let emis = 0
    for (const l of open) {
      const opening = bal[l.id]
      const interest = r2(opening * rate[l.id] / 1200)
      const emi = r2(Math.min(l.emi, opening + interest))
      bal[l.id] = r2(opening + interest - emi)
      emis += emi; totalInterest += interest
      interestByLoan[l.id] = (interestByLoan[l.id] ?? 0) + interest
      rows[l.id] = { loanId: l.id, opening, interest, emi, prepay: 0, charge: 0, closing: bal[l.id], logged: false, closedInFull: false }
      // prepayment year bookkeeping
      const fyStart = l.prepayYearStart ?? 4
      const fy = cm >= fyStart ? Math.floor(i / 12) : Math.floor(i / 12) - 1
      if (fyKey[l.id] !== fy) { fyKey[l.id] = fy; fyCount[l.id] = 0 }
    }

    // 2. Pool of extra money
    let budget = budgetFor(plan, i, start)
    if (plan.redirectClosedEmis === false) budget = Math.max(0, budget - closedEmis())
    const { auto, direct } = strategy === 'emi-only' ? { auto: 0, direct: {} as Record<number, number> } : extrasFor(plan, i)
    let pool = strategy === 'emi-only' ? 0 : Math.max(0, budget - emis) + auto
    let reserveOut = 0
    if (plan.useReserve && reserve > 0) { pool += reserve; reserveOut = reserve; reserve = 0 }

    const applyPrepay = (l: LoanInput, principal: number, chargeRate: number, full = false) => {
      const row = rows[l.id]
      principal = r2(Math.min(principal, bal[l.id]))
      if (principal <= 0) return 0
      const charge = r2(principal * chargeRate)
      bal[l.id] = r2(bal[l.id] - principal)
      row.prepay = r2(row.prepay + principal); row.charge = r2(row.charge + charge); row.closing = bal[l.id]
      row.closedInFull ||= full
      totalCharges += charge
      if (!full) fyCount[l.id] = (fyCount[l.id] ?? 0) + 1
      return principal + charge
    }

    // 3. Logged (actual) payments and money sent to a specific loan
    for (const l of open) {
      const paid = payIdx.get(`${l.id}|${month}`)
      if (paid != null) {
        const row = rows[l.id]
        row.logged = true
        const extra = r2(paid - row.emi)
        if (extra > 0) applyPrepay(l, extra / (1 + effCharge(l)), effCharge(l))
        pool = Math.max(0, pool - Math.max(0, extra))
      } else if (direct[l.id] && strategy !== 'emi-only') {
        applyPrepay(l, direct[l.id] / (1 + effCharge(l)), effCharge(l))
      }
    }

    // 4. Allocate the pool
    if (strategy !== 'emi-only' && pool > EPS) {
      const free = open.filter((l) => !rows[l.id].logged && !isLimited(l) && bal[l.id] > EPS)
      const limited = open.filter((l) => !rows[l.id].logged && isLimited(l) && bal[l.id] > EPS)
      const monthsLeft = (l: LoanInput) => Math.max(1, Math.ceil(bal[l.id] / Math.max(1, l.emi)))
      const score = (l: LoanInput) => {
        switch (strategy) {
          case 'smallest-balance': return -bal[l.id]
          case 'after-charges': return rate[l.id] - (effCharge(l) * 100 * 12) / monthsLeft(l)
          default: return rate[l.id]
        }
      }
      const order = strategy === 'no-charge-first'
        ? [...free.sort((a, b) => score(b) - score(a)), ...limited.sort((a, b) => score(b) - score(a))]
        : [...free, ...limited].sort((a, b) => score(b) - score(a))

      for (const l of order) {
        if (pool <= EPS) break
        if (bal[l.id] <= EPS) continue
        if (!isLimited(l)) { pool -= applyPrepay(l, pool, 0); continue }
        if (strategy === 'no-charge-first' && free.some((f) => bal[f.id] > EPS)) continue
        // close in full if the pool covers it
        const closeRate = (l.closeChargePct ?? 0) / 100
        if (l.canCloseFull && pool >= bal[l.id] * (1 + closeRate) - EPS) { pool -= applyPrepay(l, bal[l.id], closeRate, true); continue }
        if (strategy === 'no-charge-first') continue // wait (in reserve) until it can be closed in full
        // otherwise a part-payment, if allowed this month
        if (l.plannedMonth && l.plannedMonth !== cm) continue
        if (l.prepaysPerYear && (fyCount[l.id] ?? 0) >= l.prepaysPerYear) continue
        const cap = l.maxPrepayPct ? (rows[l.id].opening * l.maxPrepayPct) / 100 : Infinity
        const c = effCharge(l)
        pool -= applyPrepay(l, Math.min(cap, pool / (1 + c)), c)
      }
    }

    // 5. Whatever is left waits in the reserve account
    pool = r2(Math.max(0, pool))
    let reserveIn = 0
    if (plan.useReserve && strategy !== 'emi-only' && pool > EPS && loans.some((l) => bal[l.id] > EPS)) {
      reserveIn = pool
      reserve = pool
      const earned = r2(reserve * (plan.reserveRatePct ?? 0) / 1200)
      reserve += earned; reserveInterest += earned
    }
    for (const l of open) if (bal[l.id] <= EPS && !closes[l.id]) closes[l.id] = month
    months.push({
      month, budget, pool: r2(Math.max(0, budget - emis) + auto), loans: Object.values(rows),
      reserveIn, reserveOut, reserveEnd: r2(reserve),
      totalOutstanding: r2(loans.reduce((s, l) => s + Math.max(0, bal[l.id]), 0))
    })
  }
  const done = loans.every((l) => bal[l.id] <= EPS)
  return {
    strategy, months,
    debtFreeMonth: done ? months.at(-1)?.month ?? null : null,
    totalInterest: r2(totalInterest), totalCharges: r2(totalCharges), reserveInterest: r2(reserveInterest),
    totalCost: r2(totalInterest + totalCharges - reserveInterest), closes, interestByLoan
  }
}

export interface Comparison { baseline: SimResult; plans: SimResult[]; best: SimResult }

/** Runs every strategy and picks the one that is debt-free soonest (lowest cost breaks a tie). */
export function compare(loans: LoanInput[], plan: PlanInput, prefer: 'fastest' | 'cheapest' = 'fastest'): Comparison {
  const baseline = simulate(loans, plan, 'emi-only')
  const plans = STRATEGIES.map((s) => simulate(loans, plan, s.id))
  const when = (r: SimResult) => (r.debtFreeMonth ? mIndex(r.debtFreeMonth) : Infinity)
  const best = [...plans].sort((a, b) =>
    prefer === 'fastest' ? when(a) - when(b) || a.totalCost - b.totalCost : a.totalCost - b.totalCost || when(a) - when(b))[0]
  return { baseline, plans, best }
}
