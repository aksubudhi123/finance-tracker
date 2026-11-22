import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, setSetting } from '../lib/db'
import { useDebt, whatIf } from '../lib/debt'
import { findRecurring, health, tips, INCOME_IDEAS, type Level } from '../lib/insights'
import { monthKey, monthLabel, rupees } from '../lib/format'
import { shiftMonth } from '../components/MonthPicker'
import { toast } from '../lib/toast'
import type { Tab } from '../App'

const ICON: Record<Level, string> = { act: '🔴', watch: '🟡', good: '🟢' }

export default function Insights({ go }: { go: (t: Tab) => void }) {
  const now = monthKey()
  const debt = useDebt()
  const data = useLiveQuery(async () => ({
    txs: await db.transactions.where('date').aboveOrEqual(`${shiftMonth(now, -12)}-01`).toArray(),
    savings: ((await db.settings.get('savingsBalance'))?.value as number | undefined) ?? null
  }), [now])
  const [extra, setExtra] = useState(5000)
  const [savingsText, setSavingsText] = useState('')

  const totalEmi = debt?.loans.reduce((a, l) => a + l.emi, 0) ?? 0
  const h = useMemo(() => (data ? health(data.txs, now, totalEmi, data.savings) : null), [data, now, totalEmi])
  const recurring = useMemo(() => (data ? findRecurring(data.txs) : []), [data])
  const list = h ? tips(h, recurring, !!debt?.loans.length) : []
  const next = shiftMonth(now, 1)
  const impact = useMemo(() => (debt?.plan && extra > 0 ? whatIf(debt, extra, next) : null), [debt, extra, next])
  const cut = list.filter((t) => t.cut).reduce((s, t) => s + t.cut!, 0)
  const cutImpact = useMemo(() => (debt?.plan && cut > 0 ? whatIf(debt, cut, next) : null), [debt, cut, next])

  if (!data || !h || !debt) return null

  async function addToPlan() {
    const s = debt!.settings
    await setSetting('debtPlan', { ...s, extras: [...(s.extras ?? []), { amount: extra, month: next, every: 1 }] })
    toast(`Added ${rupees(extra)} a month to your loan plan from ${monthLabel(next)}`)
  }
  async function saveSavings() {
    const v = parseFloat(savingsText)
    if (v >= 0) { await setSetting('savingsBalance', v); setSavingsText(''); toast('Savings updated') }
  }

  return (
    <>
      <header className="page-head"><h1>Insights</h1>
        {h.months > 0 && <p className="muted small">Based on your last {h.months} complete month{h.months > 1 ? 's' : ''}{debt.plan ? ' and your loan plan' : ''}.</p>}
      </header>

      {h.months === 0 ? (
        <section className="card empty">
          <p className="empty-icon" aria-hidden>💡</p>
          <p>Import a bank statement or add a few entries in the Money tab, and suggestions will appear here.</p>
          <button className="btn" onClick={() => go('money')}>Go to Money</button>
        </section>
      ) : (
        <>
          <div className="grid3">
            <div className="card stat"><p className="muted small">Income / month</p><p className="strong">{rupees(h.avgIncome)}</p></div>
            <div className="card stat"><p className="muted small">Spent / month</p><p className="strong">{rupees(h.avgSpend)}</p></div>
            <div className="card stat"><p className="muted small">Kept</p><p className={`strong ${h.savingsRate != null && h.savingsRate < 0 ? 'neg' : 'pos'}`}>{h.savingsRate == null ? '–' : `${Math.round(h.savingsRate * 100)}%`}</p></div>
          </div>

          <section className="card">
            <h2>What to do next</h2>
            <ul className="tips">
              {list.map((t) => (
                <li key={t.id} className={t.level}>
                  <p><span aria-hidden>{ICON[t.level]}</span> <b>{t.title}</b></p>
                  <p className="small">{t.text}</p>
                  {t.id === 'ef' && (
                    <div className="row">
                      <input className="text-input" inputMode="numeric" placeholder={data.savings != null ? `Savings now: ${rupees(data.savings)}` : 'Money in savings now (₹)'}
                        value={savingsText} onChange={(e) => setSavingsText(e.target.value.replace(/[^0-9]/g, ''))} />
                      <button className="btn small-btn" disabled={!savingsText} onClick={saveSavings}>Save</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {cutImpact && cutImpact.monthsSooner > 0 && (
              <p className="note small">Making those cuts and putting the {rupees(cut)} a month into loans would make you debt-free <b>{cutImpact.monthsSooner} months sooner</b> and save <b>{rupees(cutImpact.interestSaved)}</b> in interest.</p>
            )}
          </section>
        </>
      )}

      {debt.plan && (
        <section className="card">
          <h2>What if I put in more each month?</h2>
          <label className="slider">
            <span>Extra <b>{rupees(extra)}</b> a month from {monthLabel(next)}</span>
            <input type="range" min={0} max={50000} step={1000} value={extra} onChange={(e) => setExtra(+e.target.value)} aria-label="Extra per month" />
          </label>
          {impact && extra > 0 && (
            <div className="split">
              <div><p className="muted small">Debt-free</p><p className="strong">{impact.debtFreeMonth ? monthLabel(impact.debtFreeMonth) : '–'}</p>
                <p className="muted small">{impact.monthsSooner > 0 ? `${impact.monthsSooner} months sooner` : 'same month'}</p></div>
              <div><p className="muted small">Interest saved</p><p className="strong pos">{rupees(impact.interestSaved)}</p></div>
            </div>
          )}
          <button className="btn ghost small-btn" disabled={!extra} onClick={addToPlan}>Add this to my loan plan</button>
        </section>
      )}

      {h.discretionary.length > 0 && (
        <section className="card">
          <h2>Spending you control</h2>
          <ul className="cat-bars">
            {h.discretionary.map((d) => {
              const change = d.before ? d.now / d.before - 1 : null
              return (
                <li key={d.category}><div className="cat-bar-head"><span>{d.category}</span>
                  <span className="num">{rupees(d.now)}/mo {change != null && Math.abs(change) >= 0.1 && <span className={`small ${change > 0 ? 'neg' : 'pos'}`}>{change > 0 ? '▲' : '▼'} {Math.round(Math.abs(change) * 100)}%</span>}</span></div></li>
              )
            })}
          </ul>
          <p className="muted small">Compared with the 3 months before. Set limits in the Budgets tab to get warnings.</p>
        </section>
      )}

      {recurring.length > 0 && (
        <section className="card">
          <h2>Repeating payments</h2>
          <ul className="extras">
            {recurring.slice(0, 12).map((r) => (
              <li key={r.payee}><span className="ellipsis">{r.payee} <span className="muted small">· {r.category} · {r.months} months</span></span><span className="num">{rupees(r.amount)}</span></li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2>Ideas to earn more</h2>
        <ul className="ideas">
          {INCOME_IDEAS.map((i) => (
            <li key={i.title}><p><b>{i.title}</b> <span className="tag">{i.range}</span></p><p className="muted small">{i.text}</p></li>
          ))}
        </ul>
        <p className="muted small">Use the slider above to see what any extra income would do to your debt-free date.</p>
      </section>
    </>
  )
}
