import { useRef } from "react";

import { useModalBehavior } from "../../../../hooks/useModalBehavior";
import { ErrorToast } from "../../../../components/ui/ErrorToast";

export function ConfirmModal({ user, busy = false, error = "", onClose, onConfirm }: { user: { name: string }; busy?: boolean; error?: string; onClose: () => void; onConfirm: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  useModalBehavior(dialogRef, () => { if (!busy) onClose(); });
  return (
    <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <section ref={dialogRef} className="admin-modal confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-title">
        <header>
          <div>
            <span className="admin-section-label danger-text">Confirmar desativação</span>
            <h2 id="delete-title">Desativar {user.name}?</h2>
          </div>
          <button className="admin-modal-close" type="button" onClick={onClose} disabled={busy} aria-label="Fechar confirmação">
            ×
          </button>
        </header>
        <p>O acesso será encerrado e o histórico preservado. Contas com vínculos ativos precisam ter esses vínculos resolvidos primeiro.</p>
        <ErrorToast message={error} />
        <div className="admin-modal-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className="admin-danger-button" type="button" onClick={onConfirm} disabled={busy}>
            Desativar usuário
          </button>
        </div>
      </section>
    </div>
  );
}
