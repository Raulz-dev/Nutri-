import { useRef, useState, type FormEvent } from "react";
import { useModalBehavior } from "../../../../hooks/useModalBehavior";
import { ErrorToast } from "../../../../components/ui/ErrorToast";
import type { PatientRow } from "../../../care/api";
import type { User } from "../../../users/types";

export function AssignmentModal({ patient, nutritionists, busy, error, onClose, onSave, onRemove }: {
  patient: PatientRow;
  nutritionists: User[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (nutritionistId: string) => void;
  onRemove: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const [selected, setSelected] = useState(patient.nutritionist_id ?? "");
  useModalBehavior(dialogRef, () => { if (!busy) onClose(); });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (selected && selected !== patient.nutritionist_id) onSave(selected);
  }

  return <div className="admin-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section ref={dialogRef} className="admin-modal assignment-modal" role="dialog" aria-modal="true" aria-labelledby="assignment-modal-title">
      <header><div><span className="admin-section-label">Acompanhamento</span><h2 id="assignment-modal-title">Nutricionista de {patient.name}</h2></div>
        <button className="admin-modal-close" type="button" onClick={onClose} disabled={busy} aria-label="Fechar">×</button></header>
      <p className="modal-helper">Responsável atual: <strong>{patient.nutritionist_name ?? "Sem vínculo"}</strong>.</p>
      <form onSubmit={submit}>
        <label><span>Novo nutricionista</span><select data-modal-initial-focus value={selected} onChange={event => setSelected(event.target.value)} disabled={busy || patient.status !== "active"}>
          <option value="">Selecione um nutricionista</option>
          {nutritionists.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
        </select></label>
        {patient.status !== "active" && <p className="modal-helper">Ative a conta do paciente para atribuir um nutricionista.</p>}
        <ErrorToast message={error} />
        <div className="admin-modal-actions">
          {patient.nutritionist_id && <button type="button" className="admin-danger-button" onClick={onRemove} disabled={busy}>Remover vínculo</button>}
          <button type="button" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="admin-primary-button" type="submit" disabled={busy || patient.status !== "active" || !selected || selected === patient.nutritionist_id}>Salvar vínculo</button>
        </div>
      </form>
    </section>
  </div>;
}
