import type { FormEvent } from "react";
import type { AccountSettings } from "../../../care/account-api";

type AccountSettingsFormProps = {
  settings: AccountSettings;
  onChange: (settings: AccountSettings) => void;
  currentPassword: string;
  onPasswordChange: (value: string) => void;
  busy: boolean;
  onSubmit: (event: FormEvent) => void;
};

export function AccountSettingsForm({
  settings,
  onChange,
  currentPassword,
  onPasswordChange,
  busy,
  onSubmit,
}: AccountSettingsFormProps) {
  return (
    <section className="admin-panel">
      <span className="admin-section-label">Perfil</span>
      <h2>Dados da conta</h2>
      <form className="admin-settings-form" onSubmit={onSubmit}>
        <label>
          Nome
          <input
            required
            minLength={2}
            maxLength={120}
            value={settings.name}
            onChange={(event) =>
              onChange({ ...settings, name: event.target.value })
            }
          />
        </label>
        <label>
          E-mail
          <input
            required
            type="email"
            value={settings.email}
            onChange={(event) =>
              onChange({ ...settings, email: event.target.value })
            }
          />
        </label>
        <label className="admin-check">
          <input
            type="checkbox"
            checked={settings.email_notifications}
            onChange={(event) =>
              onChange({
                ...settings,
                email_notifications: event.target.checked,
              })
            }
          />
          Receber notificações administrativas por e-mail
        </label>
        <label>
          Senha atual
          <input
            required
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => onPasswordChange(event.target.value)}
          />
        </label>
        <p>Ao alterar o e-mail, entre novamente com o novo endereço.</p>

        <button className="admin-primary-button" disabled={busy}>
          Salvar configurações
        </button>
      </form>
    </section>
  );
}
