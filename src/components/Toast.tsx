import { useToast } from '../lib/toast'

export default function Toast() {
  const t = useToast()
  if (!t) return null
  return <div key={t.id} className={`toast ${t.kind}`} role="status">{t.text}</div>
}
