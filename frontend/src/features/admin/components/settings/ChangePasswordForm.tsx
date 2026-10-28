import type { FormEvent } from "react";

type ChangePasswordFormProps = {
  currentPassword: string;
  onCurrentPasswordChange: (value: string) => void;
  password: string;
  onPasswordChange: (value: string) => void;
  confirmation: string;
  onConfirmationChange: (value: string) => void;
  busy: boolean;
  onSubmit: (event: FormEvent) => void;
};

export function ChangePasswordForm({
  currentPassword,
  onCurrentPasswordChange,
  password,
  onPasswordChange,
  confirmation,
  onConfirmationChange,
  busy,
  onSubmit,
}: ChangePasswordFormProps) {
  return (
    <section className="admin-panel">
      <span className="admin-section-label">Segurança</span>
      <h2>Alterar senha</h2>
      <form className="admin-settings-form" onSubmit={onSubmit}>
        <label>
          Senha atual
          <input
            required
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => onCurrentPasswordChange(event.target.value)}
          />
        </label>
        <label>
          Nova senha
          <input
            required
            minLength={8}
            maxLength={128}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
          />
        </label>
        <label>
          Confirmar nova senha
          <input
            required
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(event) => onConfirmationChange(event.target.value)}
          />
        </label>
        <p>Após a alteração, todas as sessões serão encerradas.</p>
        <button className="admin-primary-button" disabled={busy}>
          Alterar senha
        </button>
      </form>
    </section>
  );
}
