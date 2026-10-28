import { AccountSettingsForm } from "../components/settings/AccountSettingsForm";
import { ChangePasswordForm } from "../components/settings/ChangePasswordForm";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  useErrorToast,
  useSuccessToast,
} from "../../../components/ui/ErrorToast";
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
          <AccountSettingsForm
            settings={settings}
            onChange={setSettings}
            currentPassword={currentPassword}
            onPasswordChange={setCurrentPassword}
            busy={busy}
            onSubmit={submitSettings}
          />
          <ChangePasswordForm
            currentPassword={currentPassword}
            onCurrentPasswordChange={setCurrentPassword}
            password={password}
            onPasswordChange={setPassword}
            confirmation={confirmation}
            onConfirmationChange={setConfirmation}
            busy={busy}
            onSubmit={submitPassword}
          />
        </div>
      )}
    </AdminShell>
  );
}
