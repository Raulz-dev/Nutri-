import { useRef, useState, type FormEvent } from "react";

import { useModalBehavior } from "../../../../hooks/useModalBehavior";
import { useErrorToast } from "../../../../components/ui/ErrorToast";
import type { User, UserRole, UserStatus } from "../../../users/types";
import type { AdminUserInput } from "../../admin-users";

export function UserModal({
  user,
  existingUsers,
  onClose,
  onSave,
}: {
  user: User | null;
  existingUsers: User[];
  onClose: () => void;
  onSave: (input: AdminUserInput) => void;
}) {
  const [form, setForm] = useState<AdminUserInput>({ name: user?.name ?? "", email: user?.email ?? "", role: user?.role ?? "patient", status: user?.status ?? "active" });
  const [errors, setErrors] = useState<Partial<Record<keyof AdminUserInput, string>>>({});
  const dialogRef = useRef<HTMLElement>(null);
  const showError = useErrorToast();

  useModalBehavior(dialogRef, onClose);

  function submit(event: FormEvent) {
    event.preventDefault();
    const nextErrors: typeof errors = {};
    if (form.name.trim().length < 2) nextErrors.name = "Informe um nome com pelo menos 2 caracteres.";
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) nextErrors.email = "Informe um e-mail válido.";
    else if (existingUsers.some((item) => item.id !== user?.id && item.email.toLowerCase() === form.email.trim().toLowerCase()))
      nextErrors.email = "Este e-mail já está em uso.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) showError(Object.values(nextErrors).filter(Boolean).join(" "));
    if (Object.keys(nextErrors).length) return;
    onSave(form);
  }

  return (
    <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="user-modal-title">
        <header>
          <div>
            <span className="admin-section-label">{user ? "Editar registro" : "Novo registro"}</span>
            <h2 id="user-modal-title">{user ? "Editar usuário" : "Cadastrar usuário"}</h2>
          </div>
          <button className="admin-modal-close" type="button" onClick={onClose} aria-label="Fechar formulário">
            ×
          </button>
        </header>
        <p className="modal-helper">Este registro será salvo apenas como demonstração e não poderá acessar o sistema.</p>
        <form onSubmit={submit} noValidate>
          <label>
            <span>Nome completo</span>
            <input
              data-modal-initial-focus
              value={form.name}
              aria-invalid={Boolean(errors.name)}
              onChange={(event) => {
                setForm({ ...form, name: event.target.value });
                setErrors({ ...errors, name: undefined });
              }}
            />
          </label>
          <label>
            <span>E-mail</span>
            <input
              type="email"
              value={form.email}
              aria-invalid={Boolean(errors.email)}
              onChange={(event) => {
                setForm({ ...form, email: event.target.value });
                setErrors({ ...errors, email: undefined });
              }}
            />
          </label>
          <div className="admin-form-grid">
            <label>
              <span>Perfil</span>
              <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as UserRole })}>
                <option value="patient">Paciente</option>
                <option value="nutritionist">Nutricionista</option>
                <option value="admin">Administrador</option>
              </select>
            </label>
            <label>
              <span>Status</span>
              <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as UserStatus })}>
                <option value="active">Ativo</option>
                <option value="blocked">Bloqueado</option>
              </select>
            </label>
          </div>
          <div className="admin-modal-actions">
            <button type="button" onClick={onClose}>
              Cancelar
            </button>
            <button className="admin-primary-button" type="submit">
              {user ? "Salvar alterações" : "Cadastrar usuário"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
