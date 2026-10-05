import { AuthLayout } from "../layouts/AuthLayout";
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
      setError(requestError instanceof ApiError ? requestError.message : "Não foi possível conectar ao servidor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      titleId="forgot-title"
      eyebrow="Recupere seu acesso"
      title="Esqueceu sua senha?"
      description="Informe seu e-mail e enviaremos as instruções para criar uma nova senha."
      badge="Continue em movimento"
      visualText="Seu acompanhamento continua quando você voltar."
    >
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
          required
          placeholder="email@email.com"
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
    </AuthLayout>
  );
}
