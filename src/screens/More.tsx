import { useRef, useState } from 'react'
import { exportBackup, importBackup } from '../lib/db'

export default function More() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')

  async function download() {
    const backup = await exportBackup()
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `finance-backup-${backup.exportedAt.slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    setMsg('Backup saved to your Downloads folder.')
  }

  async function restore(file: File) {
    try {
      await importBackup(JSON.parse(await file.text()))
      setMsg('Backup restored.')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not read that file.')
    }
  }

  return (
    <>
      <header className="page-head"><h1>More</h1></header>

      <section className="card">
        <h2>Install on your Android phone</h2>
        <ol className="steps plain">
          <li>Open this page in <b>Chrome</b> on your phone.</li>
          <li>Tap the <b>⋮</b> menu at the top right.</li>
          <li>Tap <b>Add to Home screen</b> (or <b>Install app</b>), then <b>Install</b>.</li>
        </ol>
        <p className="muted small">It then opens like a normal app and works without internet.</p>
      </section>

      <section className="card">
        <h2>Your data</h2>
        <p className="muted small">
          Everything you enter stays on this device only. Make a backup now and then, and use it to move your data to a new phone.
        </p>
        <div className="row">
          <button className="btn" onClick={download}>Download backup</button>
          <button className="btn ghost" onClick={() => fileRef.current?.click()}>Restore backup</button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = '' }} />
        {msg && <p className="note" role="status">{msg}</p>}
      </section>

      <p className="muted small center">Finance Tracker v0.1</p>
    </>
  )
}
