import type { TxType } from './db'

// Keyword rules for Indian bank narrations. First match wins.
const RULES: { category: string; type?: TxType; words: string[] }[] = [
  { category: 'Salary', type: 'income', words: ['salary', 'sal cr', 'payroll'] },
  { category: 'EMI & loans', words: ['emi', 'loan', 'bajaj fin', 'kotak mahindra', 'ach d', 'nach', 'ecs'] },
  { category: 'Eating out', words: ['swiggy', 'zomato', 'restaurant', 'cafe', 'dominos', 'mcdonald', 'kfc', 'pizza', 'eatsure'] },
  { category: 'Groceries', words: ['bigbasket', 'blinkit', 'zepto', 'dmart', 'grocer', 'kirana', 'jiomart', 'instamart', 'reliance fresh', 'more retail'] },
  { category: 'Transport & fuel', words: ['uber', 'ola', 'rapido', 'petrol', 'fuel', 'hpcl', 'bpcl', 'iocl', 'indian oil', 'fastag', 'irctc', 'metro'] },
  { category: 'Bills & utilities', words: ['electricity', 'bescom', 'tneb', 'msedcl', 'tata power', 'airtel', 'jio', 'vodafone', 'vi ', 'broadband', 'recharge', 'gas', 'water', 'dth', 'bill'] },
  { category: 'Shopping', words: ['amazon', 'flipkart', 'myntra', 'ajio', 'meesho', 'nykaa', 'croma', 'reliance digital'] },
  { category: 'Health', words: ['pharma', 'medical', 'hospital', 'clinic', 'apollo', '1mg', 'netmeds', 'pharmeasy', 'diagnostic', 'lab'] },
  { category: 'Entertainment', words: ['netflix', 'hotstar', 'prime video', 'spotify', 'bookmyshow', 'pvr', 'inox', 'youtube'] },
  { category: 'Education', words: ['school', 'college', 'tuition', 'fees', 'byju', 'udemy', 'coursera'] },
  { category: 'Rent & housing', words: ['rent', 'maintenance', 'society'] }
]

export function guessCategory(text: string, type: TxType): string {
  const t = ` ${text.toLowerCase()} `
  for (const r of RULES) {
    if (r.type && r.type !== type) continue
    if (r.words.some((w) => t.includes(w))) return r.category
  }
  return type === 'income' ? 'Other income' : 'Other'
}
