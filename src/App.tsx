import { useState } from 'react'
import Home from './screens/Home'
import Placeholder from './screens/Placeholder'
import More from './screens/More'

export type Tab = 'home' | 'money' | 'budgets' | 'loans' | 'more'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: '🏠' },
  { id: 'money', label: 'Money', icon: '💸' },
  { id: 'budgets', label: 'Budgets', icon: '🎯' },
  { id: 'loans', label: 'Loans', icon: '🏦' },
  { id: 'more', label: 'More', icon: '⚙️' }
]

export default function App() {
  const [tab, setTab] = useState<Tab>('home')
  return (
    <div className="app">
      <main className="content">
        {tab === 'home' && <Home go={setTab} />}
        {tab === 'money' && (
          <Placeholder title="Income & expenses" step={2}
            text="Add income and spending in a few taps, pick a category, and import your bank statement." />
        )}
        {tab === 'budgets' && (
          <Placeholder title="Budgets" step={2}
            text="Set a monthly limit for each category and get a warning before you cross it." />
        )}
        {tab === 'loans' && (
          <Placeholder title="Loans & debt-free plan" step={3}
            text="Your EMIs, prepayment plan, payment log and debt-free date, imported from your Excel planner." />
        )}
        {tab === 'more' && <More />}
      </main>
      <nav className="tabbar" aria-label="Main">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}>
            <span className="tab-icon" aria-hidden>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
