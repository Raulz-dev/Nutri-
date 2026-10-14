import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useErrorToast, useSuccessToast } from "../../../components/ui/ErrorToast";
import { useAuth } from "../../auth/useAuth";
import { AdminShell } from "../AdminShell";
import {
  changePassword,
  getSettings,
  saveSettings,
  type AccountSettings,
} from "../../care/account-api";

export function AdminSettingsPage() {
  const showError = useErrorToast();
  const { session, reloadUser, logout } = useAuth();
  const navigate = useNavigate();
  const token = session!.accessToken;
  const [settings, setSettings] = useState<AccountSettings | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const showSuccess = useSuccessToast();
  const [busy, setBusy] = useState(false);
  const [originalEmail, setOriginalEmail] = useState("");
  useEffect(() => {
    let active = true;
    getSettings(token)
      .then((value) => {
        if (active) {
          setSettings(value);
          setOriginalEmail(value.email);
        }
      })
      .catch((error) => showError(error.message));
    return () => {
      active = false;
    };
  }, [token]);
  async function signInAgain() {
    await logout().catch(() => {});
    navigate("/login", { replace: true });
  }
  async function submitSettings(event: FormEvent) {
    event.preventDefault();
    if (!settings || busy) return;
    setBusy(true);

    try {
      const value = await saveSettings(token, {
        ...settings,
        current_password: currentPassword,
      });
      setSettings(value);
      setCurrentPassword("");
      if (value.email !== originalEmail) {
        await signInAgain();
        return;
      }
      await reloadUser();
      showSuccess("Configurações salvas.");
    } catch (error) {
      showError(error instanceof Error ? error.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }
  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (password !== confirmation) return showError("As senhas não coincidem.");
    setBusy(true);
    try {
      await changePassword(token, currentPassword, password, confirmation);
      await signInAgain();
    } catch (error) {
      showError(
        error instanceof Error ? error.message : "Falha ao alterar senha.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <AdminShell
      title="Configurações"
      subtitle="Gerencie sua conta administrativa."
    >
      {!settings ? (
        <p role="status">Carregando configurações...</p>
      ) : (
        <div className="admin-settings-grid">
          <section className="admin-panel">
            <span className="admin-section-label">Perfil</span>
            <h2>Dados da conta</h2>
            <form className="admin-settings-form" onSubmit={submitSettings}>
              <label>
                Nome
                <input
                  required
                  minLength={2}
                  maxLength={120}
                  value={settings.name}
                  onChange={(event) =>
                    setSettings({ ...settings, name: event.target.value })
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
                    setSettings({ ...settings, email: event.target.value })
                  }
                />
              </label>
              <label className="admin-check">
                <input
                  type="checkbox"
                  checked={settings.email_notifications}
                  onChange={(event) =>
                    setSettings({
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
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
              </label>
              <p>Ao alterar o e-mail, entre novamente com o novo endereço.</p>

              <button className="admin-primary-button" disabled={busy}>
                Salvar configurações
              </button>
            </form>
          </section>
          <section className="admin-panel">
            <span className="admin-section-label">Segurança</span>
            <h2>Alterar senha</h2>
            <form className="admin-settings-form" onSubmit={submitPassword}>
              <label>
                Senha atual
                <input
                  required
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
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
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <label>
                Confirmar nova senha
                <input
                  required
                  type="password"
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </label>
              <p>Após a alteração, todas as sessões serão encerradas.</p>
              <button className="admin-primary-button" disabled={busy}>
                Alterar senha
              </button>
            </form>
          </section>
        </div>
      )}
    </AdminShell>
  );
}
