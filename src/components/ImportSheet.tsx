import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { parseStatement, readStatementFile, type ParsedRow } from '../lib/statement'
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
      const parsed = parseStatement(raw, await db.transactions.toArray())
      if (!parsed.length) throw new Error('No transactions found in this file.')
      setRows(parsed.map((r) => ({ ...r, keep: !r.duplicate })))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read this file.')
    } finally { setBusy(false) }
  }

  async function doImport() {
    const keep = rows!.filter((r) => r.keep).map(({ keep: _k, duplicate: _d, ...t }) => t)
    await db.transactions.bulkAdd(keep)
    toast(`Imported ${keep.length} entries`)
    onClose()
  }

  const update = (i: number, patch: Partial<ParsedRow & { keep: boolean }>) =>
    setRows((rs) => rs!.map((r, j) => (j === i ? { ...r, ...patch } : r)))
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
            </p>
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
                      <select value={r.category} aria-label="Category" onChange={(e) => update(i, { category: e.target.value })}>
                        {cats.filter((c) => c.type === r.type).map((c) => <option key={c.name}>{c.name}</option>)}
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
