import { AuthLayout } from "../layouts/AuthLayout";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { ErrorToast, useErrorToast } from "../../../components/ui/ErrorToast";
import { ApiError } from "../../../lib/http-client";
import { registerPatientRequest } from "../api";

type RegisterErrors = Partial<Record<"name" | "email" | "password" | "confirmation", string>>;

export function RegisterPage() {
  const navigate = useNavigate();
  const showError = useErrorToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [errors, setErrors] = useState<RegisterErrors>({});
  const [requestError, setRequestError] = useState("");
  const [loading, setLoading] = useState(false);

  function validate() {
    const nextErrors: RegisterErrors = {};
    if (name.trim().length < 2) nextErrors.name = "Informe seu nome completo.";
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) nextErrors.email = "Informe um e-mail válido.";
    if (password.length < 8) nextErrors.password = "A senha deve ter pelo menos 8 caracteres.";
    if (confirmation !== password) nextErrors.confirmation = "As senhas não correspondem.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) showError(Object.values(nextErrors).join(" "));
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRequestError("");
    if (!validate()) return;

    setLoading(true);
    try {
      await registerPatientRequest({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
      });
      navigate("/login?cadastro=sucesso", { replace: true });
    } catch (error) {
      setRequestError(error instanceof ApiError ? error.message : "Não foi possível criar sua conta.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      titleId="register-title"
      eyebrow="Comece seu acompanhamento"
      title="Crie sua conta"
      description="Cadastre-se como paciente para acessar seu plano e acompanhar sua evolução."
      badge="Acompanhamento próximo"
      visualText="Organize sua alimentação com orientação profissional."
      className="register-page"
      image="/assets/register-healthy.webp"
    >
      <form className="login-form" onSubmit={handleSubmit} noValidate>
        <ErrorToast message={requestError} />
        <Input label="Nome completo" name="name" autoComplete="name" required
          value={name} error={errors.name} onChange={(event) => setName(event.target.value)} />
        <Input label="E-mail" name="email" type="email" autoComplete="email" required
          value={email} error={errors.email} onChange={(event) => setEmail(event.target.value)} />
        <Input label="Senha" name="password" type="password" autoComplete="new-password"
          required minLength={8} value={password} error={errors.password}
          onChange={(event) => setPassword(event.target.value)} />
        <Input label="Confirme a senha" name="password-confirmation" type="password"
          autoComplete="new-password" required minLength={8} value={confirmation}
          error={errors.confirmation} onChange={(event) => setConfirmation(event.target.value)} />
        <Button type="submit" loading={loading} loadingLabel="Criando conta...">Criar conta</Button>
        <Link className="back-link" to="/login">Já tenho uma conta</Link>
      </form>
    </AuthLayout>
  );
}
