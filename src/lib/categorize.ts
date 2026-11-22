import type { TxType } from './db'

export const TRANSFER = 'Transfer'

// Keyword rules for Indian bank narrations. Matched on whole words. First match wins.
const EXPENSE_RULES: { category: string; words: string[] }[] = [
  { category: 'EMI & loans', words: ['emi', 'loan', 'bhfl', 'bajaj fin', 'bajaj finance', 'bajaj housing', 'housing finance', 'kotak mahindra bank', 'ach d', 'nach', 'ecs', 'home loan', 'credit card', 'cc payment', 'cred'] },
  { category: 'Investments', words: ['mutual fund', 'sip', 'zerodha', 'groww', 'upstox', 'nps', 'ppf', 'lic', 'insurance', 'policy', 'fixed deposit', 'rd installment'] },
  { category: 'Eating out', words: ['swiggy', 'zomato', 'restaurant', 'cafe', 'dominos', 'mcdonald', 'mcdonalds', 'kfc', 'pizza', 'eatsure', 'food', 'foods', 'hotel', 'dhaba', 'bakery', 'sweets'] },
  { category: 'Groceries', words: ['bigbasket', 'blinkit', 'zepto', 'dmart', 'avenue supermarts', 'grocery', 'grocer', 'kirana', 'jiomart', 'instamart', 'reliance fresh', 'reliance retail', 'more retail', 'supermarket', 'vegetables', 'dairy', 'milk'] },
  { category: 'Transport & fuel', words: ['uber', 'ola', 'rapido', 'petrol', 'fuel', 'hpcl', 'bpcl', 'iocl', 'indian oil', 'fastag', 'irctc', 'indian railways', 'railway', 'metro', 'redbus', 'indigo', 'air india', 'makemytrip', 'cleartrip', 'filling station', 'petroleum'] },
  { category: 'Bills & utilities', words: ['electricity', 'mgvcl', 'dgvcl', 'ugvcl', 'pgvcl', 'bescom', 'tneb', 'msedcl', 'tata power', 'torrent power', 'airtel', 'jio', 'vodafone', 'broadband', 'recharge', 'gas', 'adani gas', 'gujarat gas', 'water bill', 'dth', 'tata play', 'bill payment', 'billpay', 'bbps'] },
  { category: 'Shopping', words: ['amazon', 'flipkart', 'myntra', 'ajio', 'meesho', 'nykaa', 'croma', 'reliance digital', 'jewellers', 'jewellery', 'jewelers', 'tanishq', 'decathlon', 'lifestyle', 'westside', 'trends'] },
  { category: 'Health', words: ['pharma', 'pharmacy', 'medical', 'medicals', 'medicine', 'hospital', 'clinic', 'apollo', '1mg', 'netmeds', 'pharmeasy', 'diagnostic', 'diagnostics', 'pathology', 'dental', 'doctor'] },
  { category: 'Entertainment', words: ['netflix', 'hotstar', 'prime video', 'spotify', 'bookmyshow', 'pvr', 'inox', 'youtube', 'sonyliv', 'zee5'] },
  { category: 'Education', words: ['school', 'college', 'tuition', 'university', 'academy', 'byju', 'byjus', 'udemy', 'coursera', 'vidyalaya'] },
  { category: 'Rent & housing', words: ['rent', 'maintenance', 'society', 'housing society'] }
]

const INCOME_RULES: { category: string; words: string[] }[] = [
  { category: 'Salary', words: ['salary', 'sal', 'payroll', 'bonus', 'stipend', 'incentive'] }
]

const words = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `

export interface CategorizeContext {
  /** Names/IDs that identify the user's own accounts (narrations containing them are transfers). */
  ownNames?: string[]
  /** Remembered payee -> category choices. */
  rules?: Record<string, string>
}

/** The other party in a narration, e.g. "UPI-SWIGGY-..." -> "swiggy". */
export function payeeOf(note: string): string {
  const parts = note.split('-').map((p) => p.trim()).filter(Boolean)
  const head = (parts[0] ?? '').toUpperCase()
  let name = parts[1] ?? parts[0] ?? ''
  if (/^(NEFT|RTGS|IMPS)/.test(head)) {
    // NEFT CR-IFSC-NAME-... / IMPS-REF-NAME-...
    name = parts.find((p, i) => i > 0 && /[A-Za-z]{3}/.test(p) && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(p)) ?? name
  } else if (!/^(UPI|POS|ACH|NACH|ECS)/.test(head)) {
    name = note
  }
  return name.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)
}

export function isOwnTransfer(note: string, ownNames: string[] = []): boolean {
  const payee = payeeOf(note)
  const lower = note.toLowerCase()
  return ownNames.some((n) => {
    const raw = n.trim().toLowerCase()
    if (raw.length < 4) return false
    // UPI IDs / account numbers: look anywhere in the narration
    if (/[@0-9]/.test(raw)) return lower.includes(raw)
    // Names: only the other party counts (salary credits also carry your name as the receiver)
    const k = words(raw).trim()
    return payee === k || words(payee).includes(` ${k} `) || (payee.length >= 12 && k.startsWith(payee))
  })
}

export function guessCategory(note: string, type: TxType, ctx: CategorizeContext = {}): string {
  if (isOwnTransfer(note, ctx.ownNames)) return TRANSFER
  const remembered = ctx.rules?.[`${type}:${payeeOf(note)}`]
  if (remembered) return remembered
  if (type === 'expense') {
    if (/BILLPAY|CREDIT CARD|\bCC\b.*PAY/i.test(note) && /\d{4,6}X+\d{4}/i.test(note)) return 'Credit card bill'
    if (/^(NWD|ATW|EAW|ATM)[- ]|CASH WDL|ATM WDL/i.test(note)) return 'Cash withdrawal'
  } else {
    if (/DISBURSE/i.test(note)) return 'Loan received'
    // Salary paid by NEFT/RTGS from a company (not refunds, funds or interest)
    if (/^(NEFT|RTGS)/i.test(note) && /\b(PRIVATE LIMITED|PVT|LIMITED|LTD)\b/i.test(note) &&
      !/MUTUAL FUND|INSURANCE|REFUND|INTEREST|DIVIDEND|SECURITIES|BROKING/i.test(note)) return 'Salary'
  }
  const w = words(note)
  for (const r of type === 'income' ? INCOME_RULES : EXPENSE_RULES) {
    if (r.words.some((k) => w.includes(` ${k} `))) return r.category
  }
  return type === 'income' ? 'Other income' : 'Other'
}
