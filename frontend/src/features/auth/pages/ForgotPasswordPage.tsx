import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { ApiError } from "../../../lib/http-client";
import { forgotPasswordRequest } from "../api";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Informe um e-mail válido.");
      return;
    }

    setLoading(true);
    try {
      const response = await forgotPasswordRequest(email.trim().toLowerCase());
      setMessage(response.message);
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
      <section className="login-card" aria-labelledby="forgot-title">
        <div className="login-card__content">
          <div className="brand" aria-label="Mais Saúde">
            <span className="brand__symbol">+</span>
            <span>Saúde</span>
          </div>

          <div className="login-card__heading">
            <span className="eyebrow">Recupere seu acesso</span>
            <h1 id="forgot-title">Esqueceu sua senha?</h1>
            <p>Informe seu e-mail e enviaremos as instruções para criar uma nova senha.</p>
          </div>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            {message && (
              <div className="login-form__success" role="status">
                {message}
              </div>
            )}
            <Input
              label="E-mail"
              type="email"
              autoComplete="email"
              placeholder="voce@exemplo.com"
              value={email}
              error={error}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Button type="submit" loading={loading} loadingLabel="Enviando...">
              Enviar instruções
            </Button>
            <Link className="back-link" to="/login">
              Voltar para o login
            </Link>
          </form>
        </div>

        <div className="login-card__visual" aria-hidden="true">
          <img src="/assets/runner-health.png" alt="" />
          <div className="visual-copy">
            <span className="visual-copy__badge">Continue em movimento</span>
            <p>Seu acompanhamento continua quando você voltar.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
