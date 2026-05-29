import { useState, useEffect, createContext, useContext, useCallback } from 'react'
import { Check, X, AlertCircle, Info } from 'lucide-react'

const ToastContext = createContext(null)

let toastId = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((message, type = 'info', duration = 3000) => {
    const id = ++toastId
    setToasts(prev => [...prev, { id, message, type, duration }])
    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }, duration)
    }
    return id
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const toast = useCallback({
    success: (msg, dur) => addToast(msg, 'success', dur),
    error: (msg, dur) => addToast(msg, 'error', dur || 5000),
    info: (msg, dur) => addToast(msg, 'info', dur),
    warning: (msg, dur) => addToast(msg, 'warning', dur || 4000),
  }, [addToast])

  return (
    <ToastContext.Provider value={{ toast, removeToast }}>
      {children}
      {/* Toast 容器 */}
      <div className="fixed top-20 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border animate-fade-in max-w-sm ${
              t.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' :
              t.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' :
              t.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-700' :
              'bg-blue-50 border-blue-200 text-blue-700'
            }`}
          >
            {t.type === 'success' && <Check className="w-4 h-4 flex-shrink-0" />}
            {t.type === 'error' && <AlertCircle className="w-4 h-4 flex-shrink-0" />}
            {t.type === 'warning' && <AlertCircle className="w-4 h-4 flex-shrink-0" />}
            {t.type === 'info' && <Info className="w-4 h-4 flex-shrink-0" />}
            <span className="text-sm flex-1">{t.message}</span>
            <button onClick={() => removeToast(t.id)} className="text-current opacity-50 hover:opacity-100 flex-shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
