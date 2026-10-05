import { useEffect, useState } from "react";
import { DEMO_RECOVERY_KEY } from "./store";

function readRecovery() {
  try {
    return localStorage.getItem(DEMO_RECOVERY_KEY);
  } catch {
    return null;
  }
}

export function DemoRecoveryNotice() {
  const [backupKey, setBackupKey] = useState(readRecovery);
  useEffect(() => {
    const refresh = () => setBackupKey(readRecovery());
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("nutri-demo-change", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("nutri-demo-change", refresh);
    };
  }, []);
  if (!backupKey) return null;
  return (
    <div className="demo-recovery-notice" role="status">
      <span>
        Os dados demonstrativos estavam inválidos. Uma cópia foi preservada no
        navegador e a demonstração foi reiniciada.
      </span>
      <button
        type="button"
        onClick={() => {
          try {
            localStorage.removeItem(DEMO_RECOVERY_KEY);
          } catch {
            /* The notice can still be dismissed. */
          }
          setBackupKey(null);
        }}
        aria-label="Fechar aviso"
      >
        ×
      </button>
    </div>
  );
}
