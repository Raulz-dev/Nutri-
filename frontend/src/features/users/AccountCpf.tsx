import { useState, type FormEvent } from "react";
import { Input } from "../../components/ui/Input";
import { useErrorToast, useSuccessToast } from "../../components/ui/ErrorToast";
import { formatCpf, normalizeCpf } from "../../lib/cpf";
import { useAuth } from "../auth/useAuth";
import { completeCpf } from "./api";

export function AccountCpf() {
  const { currentUser, session, reloadUser } = useAuth();
  const [cpf, setCpf] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const showError = useErrorToast();
  const showSuccess = useSuccessToast();
  if (!currentUser || currentUser.role === "admin") return null;
  if (currentUser.cpf) return <p>CPF: {formatCpf(currentUser.cpf)}</p>;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !session) return;
    const normalized = normalizeCpf(cpf);
    if (!normalized) return showError("Informe um CPF válido.");
    setBusy(true);
    try {
      await completeCpf(session.accessToken, normalized, password);
      setPassword("");
      await reloadUser();
      showSuccess("CPF cadastrado.");
    } catch (error) {
      showError(
        error instanceof Error
          ? error.message
          : "Não foi possível cadastrar o CPF.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="nutri-form" onSubmit={submit}>
      <h2>CPF da conta</h2>
      <p>
        Complete sua identificação. O CPF pode ser cadastrado uma única vez.
      </p>
      <Input
        label="CPF"
        name="cpf"
        inputMode="numeric"
        autoComplete="off"
        maxLength={14}
        required
        value={cpf}
        onChange={(event) => setCpf(event.target.value)}
        disabled={busy}
      />
      <Input
        label="Senha atual"
        name="current-password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        disabled={busy}
      />
      <button type="submit" disabled={busy}>
        {busy ? "Salvando..." : "Cadastrar CPF"}
      </button>
    </form>
  );
}
