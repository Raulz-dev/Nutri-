import { createContext, useEffect, useRef, type ReactNode } from "react";
import { useBlocker } from "react-router-dom";
import { useErrorToast } from "../components/ui/ErrorToast";

export const AutoSaveChecks = createContext<Set<() => boolean> | null>(null);

export function AutoSaveNavigation({ children }: { children: ReactNode }) {
  const checks = useRef(new Set<() => boolean>());
  const showError = useErrorToast();
  const blocker = useBlocker(() =>
    Array.from(checks.current).some((hasPending) => hasPending()),
  );

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    blocker.reset();
    showError("Aguarde o salvamento dos dados clínicos. Se houver falha, tente salvar novamente antes de sair.");
  }, [blocker, showError]);

  return (
    <AutoSaveChecks.Provider value={checks.current}>
      {children}
    </AutoSaveChecks.Provider>
  );
}
