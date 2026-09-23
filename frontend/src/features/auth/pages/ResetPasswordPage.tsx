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
    <main className="login-page">
      <section className="login-card" aria-labelledby="reset-title">
        <div className="login-card__content">
          <div className="brand" aria-label="Nutri Mais">
            <span>Nutri</span>
            <span className="brand__symbol">+</span>
          </div>
          <div className="login-card__heading">
            <span className="eyebrow">Recupere seu acesso</span>
            <h1 id="reset-title">Crie uma nova senha</h1>
            <p>Informe e confirme sua nova senha para concluir a recuperação.</p>
          </div>
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
        </div>
        <div className="login-card__visual" aria-hidden="true">
          <img src="/assets/runner-health.webp" alt="" />
          <div className="visual-copy">
            <span className="visual-copy__badge">Continue em movimento</span>
            <p>Seu acompanhamento continua quando você voltar.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
