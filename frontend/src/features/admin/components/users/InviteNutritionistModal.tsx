import { useRef, useState, type FormEvent } from "react";
import { useModalBehavior } from "../../../../hooks/useModalBehavior";
import { ErrorToast, useErrorToast } from "../../../../components/ui/ErrorToast";

export function InviteNutritionistModal({ busy, error, onClose, onSubmit }: {
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (name: string, email: string) => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const showError = useErrorToast();
  useModalBehavior(dialogRef, () => { if (!busy) onClose(); });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2) return showError("Informe o nome completo do nutricionista.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return showError("Informe um e-mail válido.");
    onSubmit(name.trim(), email.trim().toLowerCase());
  }

  return <div className="admin-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section ref={dialogRef} className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="invite-modal-title">
      <header><div><span className="admin-section-label">Novo profissional</span><h2 id="invite-modal-title">Convidar nutricionista</h2></div>
        <button className="admin-modal-close" type="button" onClick={onClose} disabled={busy} aria-label="Fechar">×</button></header>
      <p className="modal-helper">O profissional receberá um link temporário para definir sua senha.</p>
      <form onSubmit={submit} noValidate>
        <label><span>Nome completo</span><input data-modal-initial-focus value={name} onChange={event => setName(event.target.value)} required minLength={2} maxLength={120} disabled={busy} autoComplete="name" /></label>
        <label><span>E-mail</span><input type="email" value={email} onChange={event => setEmail(event.target.value)} required disabled={busy} autoComplete="email" /></label>
        <ErrorToast message={error} />
        <div className="admin-modal-actions"><button type="button" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="admin-primary-button" type="submit" disabled={busy}>{busy ? "Enviando..." : "Enviar convite"}</button></div>
      </form>
    </section>
  </div>;
}
