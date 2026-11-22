import { useSyncExternalStore } from 'react'

let current: { text: string; kind: 'info' | 'warn' | 'bad'; id: number } | null = null
const subs = new Set<() => void>()
let timer: ReturnType<typeof setTimeout> | undefined

export function toast(text: string, kind: 'info' | 'warn' | 'bad' = 'info') {
  current = { text, kind, id: Date.now() }
  subs.forEach((f) => f())
  clearTimeout(timer)
  timer = setTimeout(() => { current = null; subs.forEach((f) => f()) }, kind === 'info' ? 2500 : 5000)
}

export const useToast = () =>
  useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => current)
