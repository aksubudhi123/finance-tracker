import { useState } from 'react'
import Home from './screens/Home'
import More from './screens/More'
import Money from './screens/Money'
import Budgets from './screens/Budgets'
import Loans from './screens/Loans'
import Insights from './screens/Insights'
import Toast from './components/Toast'

export type Tab = 'home' | 'money' | 'budgets' | 'loans' | 'insights' | 'more'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: '🏠' },
  { id: 'money', label: 'Money', icon: '💸' },
  { id: 'budgets', label: 'Budgets', icon: '🎯' },
  { id: 'loans', label: 'Loans', icon: '🏦' },
  { id: 'insights', label: 'Insights', icon: '💡' }
]

export default function App() {
  const [tab, setTab] = useState<Tab>('home')
  return (
    <div className="app">
      <main className="content" key={tab}>
        {tab === 'home' && <Home go={setTab} />}
        {tab === 'money' && <Money />}
        {tab === 'budgets' && <Budgets />}
        {tab === 'loans' && <Loans />}
        {tab === 'insights' && <Insights go={setTab} />}
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
      <Toast />
    </div>
  )
}
