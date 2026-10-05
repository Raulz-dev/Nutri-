import { AuthLayout } from "../layouts/AuthLayout";
import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { ApiError } from "../../../lib/http-client";
import { resetPasswordRequest } from "../api";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!token) {
      setError("O link de redefinição é inválido ou está incompleto.");
      return;
    }
    if (password.length < 8) {
      setError("A nova senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmation) {
      setError("A confirmação da nova senha não corresponde.");
      return;
    }

    setLoading(true);
    try {
      const response = await resetPasswordRequest(token, password, confirmation);
      setMessage(response.message);
      setPassword("");
      setConfirmation("");
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Não foi possível conectar ao servidor.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      titleId="reset-title"
      eyebrow="Recupere seu acesso"
      title="Crie uma nova senha"
      description="Informe e confirme sua nova senha para concluir a recuperação."
      badge="Continue em movimento"
      visualText="Seu acompanhamento continua quando você voltar."
    >
      <form className="login-form" onSubmit={handleSubmit} noValidate>
        {error && <div className="login-form__alert" role="alert">{error}</div>}
        {message && <div className="login-form__success" role="status">{message}</div>}
        <Input label="Nova senha" type="password" name="new-password"
          autoComplete="new-password" required minLength={8} value={password}
          onChange={(event) => setPassword(event.target.value)} />
        <Input label="Confirme a nova senha" type="password"
          name="new-password-confirmation" autoComplete="new-password" required
          minLength={8} value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)} />
        <Button type="submit" loading={loading} loadingLabel="Redefinindo...">
          Redefinir senha
        </Button>
        <Link className="back-link" to="/login">Voltar para o login</Link>
      </form>
    </AuthLayout>
  );
}
