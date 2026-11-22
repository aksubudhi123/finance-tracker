import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSetting, setSetting } from '../lib/db'
import { holderName, parseStatement, readStatementFile, type ParsedRow } from '../lib/statement'
import { payeeOf } from '../lib/categorize'
import { rupees } from '../lib/format'
import { toast } from '../lib/toast'

export default function ImportSheet({ onClose }: { onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<(ParsedRow & { keep: boolean })[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const cats = useLiveQuery(() => db.categories.toArray()) ?? []

  async function pick(file: File) {
    setError(''); setBusy(true)
    try {
      const raw = await readStatementFile(file)
      let ownNames = await getSetting<string[]>('ownNames', [])
      const holder = holderName(raw)
      if (holder && !ownNames.some((n) => n.toLowerCase() === holder.toLowerCase())) {
        ownNames = [...ownNames, holder]
        await setSetting('ownNames', ownNames)
      }
      const rules = Object.fromEntries((await db.rules.toArray()).map((r) => [r.key, r.category]))
      const parsed = parseStatement(raw, await db.transactions.toArray(), { ownNames, rules })
      if (!parsed.length) throw new Error('No transactions found in this file.')
      setRows(parsed.map((r) => ({ ...r, keep: !r.duplicate })))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read this file.')
    } finally { setBusy(false) }
  }

  async function doImport() {
    if (learned.size) await db.rules.bulkPut([...learned.entries()].map(([key, category]) => ({ key, category })))
    const keep = rows!.filter((r) => r.keep).map(({ keep: _k, duplicate: _d, ...t }) => t)
    await db.transactions.bulkAdd(keep)
    toast(`Imported ${keep.length} entries`)
    onClose()
  }

  const [learned] = useState(() => new Map<string, string>())
  const update = (i: number, patch: Partial<ParsedRow & { keep: boolean }>) =>
    setRows((rs) => rs!.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  // Changing a category applies to every entry with the same payee, and is remembered for next time.
  const recategorise = (i: number, category: string) =>
    setRows((rs) => {
      const target = rs![i]
      const key = `${target.type}:${payeeOf(target.note ?? '')}`
      learned.set(key, category)
      return rs!.map((r) => (r.type === target.type && `${r.type}:${payeeOf(r.note ?? '')}` === key ? { ...r, category } : r))
    })
  const count = rows?.filter((r) => r.keep).length ?? 0

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet tall" role="dialog" aria-label="Import bank statement" onClick={(e) => e.stopPropagation()}>
        <h2>Import bank statement</h2>
        {!rows && (
          <>
            <p className="muted small">
              Download your statement from net banking as <b>Excel (.xls / .xlsx)</b> or <b>CSV</b>, then choose it here.
              PDF statements aren't supported yet. The file is read on this phone only.
            </p>
            <button className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? 'Reading…' : 'Choose file'}
            </button>
            <input ref={fileRef} type="file" hidden accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = '' }} />
            {error && <p className="note bad" role="alert">{error}</p>}
          </>
        )}
        {rows && (
          <>
            <p className="muted small">
              Found {rows.length} entries. Check the categories, untick anything you don't want.
              {rows.some((r) => r.duplicate) && ' Entries that look already added are unticked.'}
              {' '}Changing a category changes it for every entry from the same payee, and the app remembers it for next time.
              Money moved between your own accounts is marked <b>Transfer</b> and isn't counted as income or spending.
            </p>
            <ImportSummary rows={rows.filter((r) => r.keep)} />
            <ul className="import-list">
              {rows.map((r, i) => (
                <li key={i} className={r.keep ? '' : 'off'}>
                  <input type="checkbox" checked={r.keep} aria-label="Include" onChange={(e) => update(i, { keep: e.target.checked })} />
                  <div className="grow">
                    <div className="tx-top">
                      <span className="ellipsis">{r.note || '(no description)'}</span>
                      <span className={`num ${r.type === 'income' ? 'pos' : ''}`}>{r.type === 'income' ? '+' : '−'}{rupees(r.amount)}</span>
                    </div>
                    <div className="tx-top">
                      <span className="muted small">{r.date}{r.duplicate ? ' · already added?' : ''}</span>
                      <select value={r.category} aria-label="Category" onChange={(e) => recategorise(i, e.target.value)}>
                        {cats.filter((c) => c.type === r.type || c.type === 'both').map((c) => <option key={c.name}>{c.name}</option>)}
                      </select>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="row end">
              <button className="btn ghost" onClick={onClose}>Cancel</button>
              <button className="btn" disabled={!count} onClick={doImport}>Import {count}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ImportSummary({ rows }: { rows: ParsedRow[] }) {
  const sum = (f: (r: ParsedRow) => boolean) => rows.filter(f).reduce((s, r) => s + r.amount, 0)
  const inc = sum((r) => r.type === 'income' && r.category !== 'Transfer')
  const exp = sum((r) => r.type === 'expense' && r.category !== 'Transfer')
  const other = rows.filter((r) => r.category === 'Other' || r.category === 'Other income').length
  return (
    <div className="split three import-sum">
      <div><p className="muted small">Income</p><p className="pos strong">{rupees(inc)}</p></div>
      <div><p className="muted small">Spent</p><p className="strong">{rupees(exp)}</p></div>
      <div><p className="muted small">Uncategorised</p><p className="strong">{other}</p></div>
    </div>
  )
}
