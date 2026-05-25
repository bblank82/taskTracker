import { createContext, useContext, useState, useCallback, useRef } from 'react'

interface ToastItem {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
  undo?: () => void
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastItem['type'], undo?: () => void) => void
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)

  const showToast = useCallback((message: string, type: ToastItem['type'] = 'success', undo?: () => void) => {
    const id = ++idRef.current
    setToasts((prev) => [...prev, { id, message, type, undo }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), undo ? 5000 : 3000)
  }, [])

  const dismiss = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id))

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm shadow-lg min-w-64 max-w-sm
              ${toast.type === 'error' ? 'bg-red-950 border-red-800 text-red-200' : 'bg-elevated border-border text-text-primary'}`}
          >
            <span className="flex-1">{toast.message}</span>
            {toast.undo && (
              <button
                onClick={() => { toast.undo!(); dismiss(toast.id) }}
                className="text-accent hover:text-indigo-400 font-medium whitespace-nowrap"
              >
                Undo
              </button>
            )}
            <button onClick={() => dismiss(toast.id)} className="text-text-muted hover:text-text-secondary ml-1">✕</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
