import type { Transaction } from './db'
import { payeeOf } from './categorize'

const NOT_INCOME = new Set(['Transfer', 'Loan received'])
const NOT_SPEND = new Set(['Transfer'])
export const ESSENTIAL = ['EMI & loans', 'Rent & housing', 'Bills & utilities', 'Groceries', 'Health', 'Education', 'Transport & fuel']
export const DISCRETIONARY = ['Eating out', 'Shopping', 'Entertainment', 'Cash withdrawal', 'Other']

export interface MonthTotals { month: string; income: number; spend: number; byCat: Record<string, number> }

export function monthTotals(txs: Transaction[]): MonthTotals[] {
  const m = new Map<string, MonthTotals>()
  for (const t of txs) {
    const k = t.date.slice(0, 7)
    const row = m.get(k) ?? { month: k, income: 0, spend: 0, byCat: {} }
    if (t.type === 'income' && !NOT_INCOME.has(t.category)) row.income += t.amount
    if (t.type === 'expense' && !NOT_SPEND.has(t.category)) {
      row.spend += t.amount
      row.byCat[t.category] = (row.byCat[t.category] ?? 0) + t.amount
    }
    m.set(k, row)
  }
  return [...m.values()].sort((a, b) => a.month.localeCompare(b.month))
}

/** Up to `n` most recent complete months (the current month is skipped while it is still running). */
export function recentWindow(months: MonthTotals[], current: string, n = 3) {
  const done = months.filter((m) => m.month < current)
  const use = done.length ? done : months
  return { recent: use.slice(-n), before: use.slice(-2 * n, -n) }
}

const avg = (rows: MonthTotals[], f: (m: MonthTotals) => number) => (rows.length ? rows.reduce((s, m) => s + f(m), 0) / rows.length : 0)

export interface Recurring { payee: string; category: string; amount: number; months: number; lastDate: string }

/** Same payee, similar amount, in at least 3 different months. */
export function findRecurring(txs: Transaction[]): Recurring[] {
  const groups = new Map<string, Transaction[]>()
  for (const t of txs) {
    if (t.type !== 'expense' || NOT_SPEND.has(t.category)) continue
    const p = t.note ? payeeOf(t.note) : `[${t.category}]`
    if (!p) continue
    groups.set(p, [...(groups.get(p) ?? []), t])
  }
  const out: Recurring[] = []
  for (const [payee, list] of groups) {
    const amounts = list.map((t) => t.amount).sort((a, b) => a - b)
    const median = amounts[Math.floor(amounts.length / 2)]
    const similar = list.filter((t) => Math.abs(t.amount - median) <= Math.max(50, median * 0.1))
    const months = new Set(similar.map((t) => t.date.slice(0, 7)))
    if (months.size >= 3) {
      const last = similar.reduce((a, b) => (a.date > b.date ? a : b))
      out.push({ payee, category: last.category, amount: median, months: months.size, lastDate: last.date })
    }
  }
  return out.sort((a, b) => b.amount - a.amount)
}

export interface Health {
  months: number
  avgIncome: number
  avgSpend: number
  savingsRate: number | null // 0..1
  emiLoad: number | null // 0..1 of income
  essentials: number // per month
  emergencyTarget: number // 6 months of essentials
  emergencyMonths: number | null
  discretionary: { category: string; now: number; before: number | null }[]
  otherShare: number // share of spend left in "Other"
  cashShare: number
  cardBills: number
}

export function health(txs: Transaction[], current: string, totalEmi: number, savings: number | null): Health {
  const { recent, before } = recentWindow(monthTotals(txs), current)
  const avgIncome = avg(recent, (m) => m.income)
  const avgSpend = avg(recent, (m) => m.spend)
  const cat = (rows: MonthTotals[], c: string) => avg(rows, (m) => m.byCat[c] ?? 0)
  const emi = totalEmi || cat(recent, 'EMI & loans')
  const essentials = ESSENTIAL.reduce((s, c) => s + (c === 'EMI & loans' ? emi : cat(recent, c)), 0)
  return {
    months: recent.length,
    avgIncome, avgSpend,
    savingsRate: avgIncome > 0 ? (avgIncome - avgSpend) / avgIncome : null,
    emiLoad: avgIncome > 0 && emi > 0 ? emi / avgIncome : null,
    essentials,
    emergencyTarget: essentials * 6,
    emergencyMonths: savings != null && essentials > 0 ? savings / essentials : null,
    discretionary: DISCRETIONARY.map((c) => ({ category: c, now: cat(recent, c), before: before.length ? cat(before, c) : null }))
      .filter((d) => d.now > 0).sort((a, b) => b.now - a.now),
    otherShare: avgSpend ? cat(recent, 'Other') / avgSpend : 0,
    cashShare: avgSpend ? cat(recent, 'Cash withdrawal') / avgSpend : 0,
    cardBills: cat(recent, 'Credit card bill')
  }
}

export type Level = 'act' | 'watch' | 'good'
export interface Tip { id: string; level: Level; title: string; text: string; cut?: number }

const inr = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Math.round(n))
const pct = (x: number) => `${Math.round(x * 100)}%`

export function tips(h: Health, recurring: Recurring[], hasLoans: boolean): Tip[] {
  const out: Tip[] = []
  if (!h.months) return out
  if (h.emiLoad != null) {
    if (h.emiLoad > 0.5) out.push({ id: 'emi', level: 'act', title: `EMIs take ${pct(h.emiLoad)} of your income`, text: 'Above 40–50% leaves little room for surprises. Take no new loans (including no-cost EMI and buy-now-pay-later) until a loan closes, and send every bonus to your prepayment plan.' })
    else if (h.emiLoad > 0.35) out.push({ id: 'emi', level: 'watch', title: `EMIs take ${pct(h.emiLoad)} of your income`, text: 'That is on the high side. Avoid new loans; each loan you close frees its EMI for the next one.' })
  }
  if (h.savingsRate != null) {
    if (h.savingsRate < 0) out.push({ id: 'save', level: 'act', title: `You spent ${inr(-h.savingsRate * h.avgIncome)} a month more than you earned`, text: 'Over the last months spending (including EMIs and card bills) was above income. Check the biggest categories below and set budgets for them.' })
    else if (h.savingsRate < 0.1) out.push({ id: 'save', level: 'watch', title: `You keep ${pct(h.savingsRate)} of your income`, text: 'Aim for at least 10–20% after EMIs. Small cuts in the categories below add up quickly.' })
    else out.push({ id: 'save', level: 'good', title: `You keep ${pct(h.savingsRate)} of your income`, text: 'Good. Make sure that money is working: prepaying a 10–11% loan is a guaranteed 10–11% return.' })
  }
  if (h.emergencyMonths == null) out.push({ id: 'ef', level: 'watch', title: 'Emergency fund: tell the app what you have saved', text: `A safety net of about 6 months of essentials is ${inr(h.emergencyTarget)} for you. Enter your savings below to check it.` })
  else if (h.emergencyMonths < 3) out.push({ id: 'ef', level: 'act', title: `Your savings cover ${h.emergencyMonths.toFixed(1)} months of essentials`, text: `Before prepaying aggressively, keep at least 3 months (${inr(h.essentials * 3)}) aside, ideally in a sweep-in FD that earns more than a savings account. A job loss with no buffer usually means a new expensive loan.` })
  else if (h.emergencyMonths < 6) out.push({ id: 'ef', level: 'watch', title: `Your savings cover ${h.emergencyMonths.toFixed(1)} months of essentials`, text: `Good start. Build up to 6 months (${inr(h.emergencyTarget)}) over time, then put everything extra into loans.` })
  else out.push({ id: 'ef', level: 'good', title: `Your savings cover ${h.emergencyMonths.toFixed(1)} months of essentials`, text: 'You have a solid buffer. Money beyond this is better used to prepay loans than to sit in a savings account.' })

  for (const d of h.discretionary.slice(0, 3)) {
    if (d.category === 'Other' || d.category === 'Cash withdrawal' || d.now < 1000) continue
    const cut = Math.round((d.now * 0.2) / 100) * 100
    const up = d.before && d.now > d.before * 1.15 ? ` That's up ${pct(d.now / d.before - 1)} from the months before.` : ''
    out.push({ id: `cut-${d.category}`, level: up ? 'act' : 'watch', title: `${d.category}: ${inr(d.now)} a month`, text: `Cutting it by a fifth frees about ${inr(cut)} a month.${up} Set a budget for it in the Budgets tab.`, cut })
  }
  if (h.cashShare > 0.05) out.push({ id: 'cash', level: 'watch', title: `${pct(h.cashShare)} of your spending is ATM cash`, text: 'Cash is hard to track. Pay by UPI where you can, or add cash spends with the + button so they show up in your categories.' })
  if (h.otherShare > 0.25) out.push({ id: 'other', level: 'watch', title: `${pct(h.otherShare)} of your spending is uncategorised`, text: 'Most of it is UPI payments to people. Give the big payees a category once (when importing, or by editing an entry) and the app will remember them. Better categories give better advice.' })
  if (h.cardBills > 0) out.push({ id: 'card', level: 'watch', title: `Credit card bills: ${inr(h.cardBills)} a month`, text: 'Always pay the full amount due, never the minimum: card interest is 36–42% a year, far above any loan. Import the card statement too, to see what that money was spent on.' })
  const subs = recurring.filter((r) => !['EMI & loans', 'Rent & housing', 'Credit card bill'].includes(r.category))
  if (subs.length) out.push({ id: 'recurring', level: 'watch', title: `${subs.length} repeating payment${subs.length > 1 ? 's' : ''} found`, text: `Together about ${inr(subs.reduce((s, r) => s + r.amount, 0))} a month. Check the list below and cancel anything you no longer use.` })
  if (hasLoans) out.push({ id: 'tax', level: 'watch', title: 'Claim your home loan tax benefits', text: 'Under the old tax regime, home loan interest can be deducted up to ₹2,00,000 a year (section 24(b)) and principal within the ₹1,50,000 limit of 80C. Check which regime leaves you paying less tax when you file, and declare it to your employer so less TDS is cut each month.' })
  const order: Record<Level, number> = { act: 0, watch: 1, good: 2 }
  return out.sort((a, b) => order[a.level] - order[b.level])
}

export const INCOME_IDEAS: { title: string; text: string; range: string }[] = [
  { title: 'Send every bonus and increment to loans', text: 'Your raise is the easiest extra income. Raise the monthly amount for loans in Loans → ⚙ Plan every time your salary goes up.', range: '₹5,000–20,000 / month' },
  { title: 'Freelance or consult in your field', text: 'Weekend projects, technical writing or consulting for small firms through your network or sites like LinkedIn, Upwork or Truelancer. Check your employment contract first.', range: '₹10,000–40,000 / month' },
  { title: 'Teach what you know', text: 'Online tutoring for school or college students, or a short course on your professional skill (Unacademy, Udemy, local coaching centres).', range: '₹5,000–25,000 / month' },
  { title: 'Earn more on idle money', text: 'Keep your emergency fund and loan reserve in a sweep-in FD or liquid fund instead of a 3% savings account.', range: '₹500–3,000 / month' },
  { title: 'Rent out space you don’t use', text: 'A spare room, parking spot or storage space; or list unused items (furniture, gadgets) on OLX or Facebook Marketplace.', range: '₹3,000–15,000 / month' },
  { title: 'Use a cashback card for fixed bills', text: 'Pay bills, fuel and groceries with a cashback card and pay it in full every month. Only worth it if the bill is always cleared.', range: '₹500–2,000 / month' }
]
