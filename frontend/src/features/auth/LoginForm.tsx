import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { ApiError } from "../../lib/http-client";
import { useAuth } from "./useAuth";

type FormErrors = {
  email?: string;
  password?: string;
};

export function LoginForm() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [requestError, setRequestError] = useState("");
  const [loading, setLoading] = useState(false);

  function validate() {
    const nextErrors: FormErrors = {};
    if (!email.trim()) nextErrors.email = "Informe seu e-mail.";
    else if (!/^\S+@\S+\.\S+$/.test(email)) nextErrors.email = "Informe um e-mail válido.";
    if (!password) nextErrors.password = "Informe sua senha.";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRequestError("");
    if (!validate()) return;

    setLoading(true);
    try {
      await login({ email: email.trim().toLowerCase(), password });
      navigate("/app/perfil", { replace: true });
    } catch (error) {
      setRequestError(
        error instanceof ApiError ? error.message : "Não foi possível conectar ao servidor.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit} noValidate>
      {requestError && (
        <div className="login-form__alert" role="alert">
          {requestError}
        </div>
      )}

      <Input
        label="E-mail"
        type="email"
        name="email"
        autoComplete="email"
        placeholder="voce@exemplo.com"
        value={email}
        error={errors.email}
        onChange={(event) => setEmail(event.target.value)}
      />

      <div className="password-field">
        <Input
          label="Senha"
          type={showPassword ? "text" : "password"}
          name="password"
          autoComplete="current-password"
          placeholder="Digite sua senha"
          value={password}
          error={errors.password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button
          className="password-field__toggle"
          type="button"
          onClick={() => setShowPassword((visible) => !visible)}
          aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
        >
          {showPassword ? "Ocultar" : "Mostrar"}
        </button>
      </div>

      <div className="login-form__options">
        <Link to="/esqueci-senha">Esqueci minha senha</Link>
      </div>

      <Button type="submit" loading={loading} loadingLabel="Entrando...">
        Entrar
      </Button>
    </form>
  );
}
