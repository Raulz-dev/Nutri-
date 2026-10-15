import { useCallback, useEffect, useRef, useState } from "react";

// Serialize requests so a slower response never overwrites a newer draft.
export function useAutoSave(value: string | null, save: () => Promise<void>) {
  const latest = useRef({ value, save });
  latest.current = { value, save };
  const saved = useRef<string | null>(null);
  const running = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (running.current) return;
    running.current = true;
    try {
      while (latest.current.value !== null && latest.current.value !== saved.current) {
        const draft = latest.current;
        setStatus("saving");
        setError("");
        await draft.save();
        saved.current = draft.value;
      }
      setStatus(saved.current === null ? "idle" : "saved");
    } catch (reason) {
      setStatus("error");
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar automaticamente.");
    } finally {
      running.current = false;
    }
  }, []);

  useEffect(() => {
    if (value === null || value === saved.current) return;
    setStatus("pending");
    timer.current = setTimeout(() => { void flush(); }, 1000);
    return () => clearTimeout(timer.current);
  }, [value, flush]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (latest.current.value !== null && latest.current.value !== saved.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      void flush();
    };
  }, [flush]);

  return { status: value === null ? "idle" : value !== saved.current && status === "saved" ? "pending" : status, error, flush };
}
