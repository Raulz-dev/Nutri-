import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AuthLayout } from "../layouts/AuthLayout";
import { Input } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";
import { ErrorToast } from "../../../components/ui/ErrorToast";
import { acceptInvitation } from "../../care/api";

export function FirstAccessPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!token) return setError("O convite está incompleto.");
    if (password.length < 8) return setError("Use pelo menos 8 caracteres.");
    if (password !== confirmation) return setError("As senhas não coincidem.");
    setLoading(true);
    try { await acceptInvitation(token, password, confirmation); setDone(true); setPassword(""); setConfirmation(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível aceitar o convite."); }
    finally { setLoading(false); }
  }
  return <AuthLayout titleId="first-access-title" eyebrow="Convite profissional" title="Defina sua senha"
    description="Crie uma senha para acessar sua conta." badge="Nutri +" visualText="Acompanhamento nutricional.">
    {done ? <div role="status" className="login-form__success">Senha definida. <Link to="/login">Entrar</Link></div> :
    <form className="login-form" onSubmit={submit} noValidate>
      <ErrorToast message={error} />
      <Input label="Nova senha" name="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} />
      <Input label="Confirme a senha" name="confirmation" type="password" autoComplete="new-password" required minLength={8} value={confirmation} onChange={e => setConfirmation(e.target.value)} />
      <Button type="submit" loading={loading} loadingLabel="Salvando...">Definir senha</Button>
      <Link className="back-link" to="/login">Voltar ao login</Link>
    </form>}
  </AuthLayout>;
}
