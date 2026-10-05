import { useRef } from "react";

import { useModalBehavior } from "../../../../hooks/useModalBehavior";
import type { User } from "../../../users/types";

export function ConfirmModal({ user, onClose, onConfirm }: { user: User; onClose: () => void; onConfirm: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  useModalBehavior(dialogRef, onClose);
  return (
    <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} className="admin-modal confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-title">
        <header>
          <div>
            <span className="admin-section-label danger-text">Confirmar exclusão</span>
            <h2 id="delete-title">Excluir {user.name}?</h2>
          </div>
          <button className="admin-modal-close" type="button" onClick={onClose} aria-label="Fechar confirmação">
            ×
          </button>
        </header>
        <p>O registro demonstrativo será removido deste navegador. Essa ação não afeta nenhuma conta real.</p>
        <div className="admin-modal-actions">
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="admin-danger-button" type="button" onClick={onConfirm}>
            Excluir usuário
          </button>
        </div>
      </section>
    </div>
  );
}

