import { useEffect, useRef } from 'react'

type ShortcutMap = Record<string, (e: KeyboardEvent) => void>

function isTyping(e: KeyboardEvent): boolean {
  const tag = (e.target as HTMLElement).tagName
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return true
  if ((e.target as HTMLElement).isContentEditable) return true
  return false
}

export function useGlobalShortcuts(shortcuts: ShortcutMap) {
  const ref = useRef(shortcuts)
  ref.current = shortcuts  // synchronous — always current before any keydown fires

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isTyping(e) && e.key !== 'Escape') return
      const fn = ref.current[e.key]
      if (fn) { e.preventDefault(); fn(e) }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])
}
