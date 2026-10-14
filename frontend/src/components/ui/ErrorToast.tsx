import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import "./error-toast.css";

type ToastKind = "error" | "success";
type Toast = { id: number; message: string; kind: ToastKind };
const ToastContext = createContext<((message: string, kind?: ToastKind) => void) | null>(null);
let nextToastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const lastShown = useRef({ message: "", kind: "error" as ToastKind, time: 0, id: 0 });

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts(current => current.filter(toast => toast.id !== id));
  }, []);

  const showToast = useCallback((message: string, kind: ToastKind = "error") => {
    const normalized = message.trim();
    if (!normalized) return;
    const now = Date.now();
    if (lastShown.current.kind === kind && lastShown.current.message === normalized && now - lastShown.current.time < 500) {
      const id = lastShown.current.id;
      if (!timers.current.has(id)) timers.current.set(id, setTimeout(() => dismiss(id), 7000));
      return;
    }
    const id = ++nextToastId;
    lastShown.current = { message: normalized, kind, time: now, id };
    setToasts(current => [...current, { id, message: normalized, kind }].slice(-3));
    timers.current.set(id, setTimeout(() => dismiss(id), 7000));
  }, [dismiss]);

  useEffect(() => () => {
    for (const timer of timers.current.values()) clearTimeout(timer);
    timers.current.clear();
  }, []);

  return <ToastContext.Provider value={showToast}>
    {children}
    <div className="error-toast-stack">
      {toasts.map(toast => <div className={`error-toast${toast.kind === "success" ? " success-toast" : ""}`} role={toast.kind === "success" ? "status" : "alert"} key={toast.id}>
        <span className="error-toast-icon" aria-hidden="true">{toast.kind === "success" ? "✓" : "!"}</span>
        <p>{toast.message}</p>
        <button type="button" onClick={() => dismiss(toast.id)} aria-label={toast.kind === "success" ? "Fechar confirmação" : "Fechar erro"}>×</button>
      </div>)}
    </div>
  </ToastContext.Provider>;
}

export function useErrorToast() {
  const showError = useContext(ToastContext);
  if (!showError) throw new Error("ToastProvider não encontrado.");
  return showError;
}

export function ErrorToast({ message }: { message: string }) {
  const showError = useErrorToast();
  useEffect(() => { if (message) showError(message); }, [message, showError]);
  return null;
}

export function useSuccessToast() {
  const showToast = useContext(ToastContext);
  if (!showToast) throw new Error("ToastProvider não encontrado.");
  return useCallback((message: string) => showToast(message, "success"), [showToast]);
}
