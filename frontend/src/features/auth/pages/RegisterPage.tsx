import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { ApiError } from "../../../lib/http-client";
import { registerPatientRequest } from "../api";

type RegisterErrors = Partial<Record<"name" | "email" | "password" | "confirmation", string>>;

export function RegisterPage() {
  const navigate = useNavigate();
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
    <main className="login-page register-page">
      <section className="login-card" aria-labelledby="register-title">
        <div className="login-card__content">
          <div className="brand" aria-label="Nutri Mais">
            <span>Nutri</span><span className="brand__symbol">+</span>
          </div>
          <div className="login-card__heading">
            <span className="eyebrow">Comece seu acompanhamento</span>
            <h1 id="register-title">Crie sua conta</h1>
            <p>Cadastre-se como paciente para acessar seu plano e acompanhar sua evolução.</p>
          </div>
          <form className="login-form" onSubmit={handleSubmit} noValidate>
            {requestError ? <div className="login-form__alert" role="alert">{requestError}</div> : null}
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
        </div>
        <div className="login-card__visual" aria-hidden="true">
          <img src="/assets/register-healthy.webp" alt="" />
          <div className="visual-copy"><span className="visual-copy__badge">Acompanhamento próximo</span><p>Organize sua alimentação com orientação profissional.</p></div>
        </div>
      </section>
    </main>
  );
}
