import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Transaction, type TxType } from '../lib/db'
import { crossingAlert } from '../lib/budget'
import { toast } from '../lib/toast'

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function TxSheet({ tx, onClose }: { tx?: Transaction; onClose: () => void }) {
  const [type, setType] = useState<TxType>(tx?.type ?? 'expense')
  const [amount, setAmount] = useState(tx ? String(tx.amount) : '')
  const [category, setCategory] = useState(tx?.category ?? '')
  const [date, setDate] = useState(tx?.date ?? today())
  const [note, setNote] = useState(tx?.note ?? '')
  const cats = useLiveQuery(() => db.categories.where('type').anyOf(type, 'both').toArray(), [type]) ?? []
  const value = parseFloat(amount)
  const valid = value > 0 && category && date

  async function save() {
    if (!valid) return
    const row: Transaction = { date, type, amount: Math.round(value * 100) / 100, category, note: note.trim() || undefined }
    if (type === 'expense') {
      const budget = await db.budgets.where('category').equals(category).first()
      const month = date.slice(0, 7)
      const spent = (await db.transactions.where('date').startsWith(month).toArray())
        .filter((t) => t.type === 'expense' && t.category === category && t.id !== tx?.id)
        .reduce((s, t) => s + t.amount, 0)
      const alert = crossingAlert(category, spent, row.amount, budget?.monthlyLimit)
      if (alert) toast(alert, alert.startsWith('Over') ? 'bad' : 'warn')
      else toast('Saved')
    } else toast('Saved')
    if (tx?.id) await db.transactions.update(tx.id, { ...row, note: row.note ?? '' })
    else await db.transactions.add(row)
    onClose()
  }

  async function remove() {
    if (tx?.id) { await db.transactions.delete(tx.id); toast('Deleted') }
    onClose()
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={tx ? 'Edit entry' : 'Add entry'} onClick={(e) => e.stopPropagation()}>
        <div className="seg">
          <button className={type === 'expense' ? 'on' : ''} onClick={() => { setType('expense'); setCategory('') }}>Expense</button>
          <button className={type === 'income' ? 'on income' : ''} onClick={() => { setType('income'); setCategory('') }}>Income</button>
        </div>
        <label className="amount-field">
          <span>₹</span>
          <input inputMode="decimal" placeholder="0" autoFocus={!tx} value={amount} aria-label="Amount"
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} />
        </label>
        <div className="chips" role="radiogroup" aria-label="Category">
          {cats.map((c) => (
            <button key={c.name} role="radio" aria-checked={category === c.name}
              className={category === c.name ? 'chip on' : 'chip'} onClick={() => setCategory(c.name)}>
              {c.icon} {c.name}
            </button>
          ))}
        </div>
        <div className="row2">
          <label className="field">Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="field">Note<input placeholder="Optional" value={note} onChange={(e) => setNote(e.target.value)} /></label>
        </div>
        <div className="row end">
          {tx && <button className="btn danger ghost" onClick={remove}>Delete</button>}
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={!valid} onClick={save}>Save</button>
        </div>
      </div>
    </div>
  )
}
