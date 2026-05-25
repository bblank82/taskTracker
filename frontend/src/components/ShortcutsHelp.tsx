const SHORTCUTS = [
  { group: 'Navigation', items: [
    { key: '↓ / ↑', desc: 'Move down / up through tasks' },
    { key: 'Enter', desc: 'Open focused task' },
    { key: 'Escape', desc: 'Close panel or modal' },
    { key: '?', desc: 'Show this help' },
  ]},
  { group: 'Create', items: [
    { key: 'n', desc: 'New task' },
    { key: 't', desc: 'New project' },
  ]},
  { group: 'Filter', items: [
    { key: '/', desc: 'Focus search' },
    { key: '1', desc: 'View: All tasks' },
    { key: '2', desc: 'View: My tasks' },
    { key: '3', desc: 'View: Delegated' },
  ]},
  { group: 'Task panel', items: [
    { key: 'c', desc: 'Mark complete / Reopen' },
    { key: 'f', desc: 'Close & follow up' },
    { key: 'd', desc: 'Defer to tomorrow' },
    { key: 'a', desc: 'Focus comment box' },
  ]},
]

interface ShortcutsHelpProps {
  onClose: () => void
}

export function ShortcutsHelp({ onClose }: ShortcutsHelpProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-surface border border-border rounded-lg w-full max-w-sm mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-text-primary">Keyboard Shortcuts</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">✕</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {SHORTCUTS.map(({ group, items }) => (
            <div key={group}>
              <p className="text-xs text-text-muted uppercase tracking-wide mb-2">{group}</p>
              <div className="space-y-1.5">
                {items.map(({ key, desc }) => (
                  <div key={key} className="flex items-center justify-between gap-4">
                    <span className="text-sm text-text-secondary">{desc}</span>
                    <kbd className="font-mono text-xs bg-elevated border border-border rounded px-2 py-0.5 text-text-primary whitespace-nowrap">
                      {key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-border text-xs text-text-muted">
          Shortcuts are disabled while typing in any input field.
        </div>
      </div>
    </div>
  )
}
