import { useEffect, useState, type FormEvent } from "react";
import { useErrorToast } from "../../../components/ui/ErrorToast";
import { useAuth } from "../../auth/useAuth";
import {
  getProfessionalProfile,
  saveProfessionalProfile,
  type ProfessionalProfile,
} from "../../care/account-api";
export function NutritionistProfilePage() {
  const showError = useErrorToast();
  const { session } = useAuth();
  const token = session!.accessToken;
  const [form, setForm] = useState<ProfessionalProfile>({
    name: "",
    crn: "",
    contact: "",
    bio: "",
    revision: 1,
  });
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    setLoadError("");
    getProfessionalProfile(token)
      .then((value) => {
        if (active) {
          setForm(value);
          setLoaded(true);
        }
      })
      .catch((error) => {
        if (active) setLoadError(error.message);
      });
    return () => {
      active = false;
    };
  }, [token, retry]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!loaded || busy) return;
    setBusy(true);
    setMessage("");
    try {
      setForm(await saveProfessionalProfile(token, form));
      setMessage("Perfil salvo.");
    } catch (error) {
      showError(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o perfil.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!loaded)
    return (
      <section className="nutri-card">
        <p role="status">{loadError || "Carregando perfil..."}</p>
        {loadError && (
          <button onClick={() => setRetry((value) => value + 1)}>
            Tentar novamente
          </button>
        )}
      </section>
    );
  return (
    <>
      <header className="nutri-heading">
        <span>SEU PERFIL</span>
        <h1>Meu perfil</h1>
        <p>Apresente seu trabalho aos pacientes.</p>
      </header>
      <section className="nutri-card">
        <form className="nutri-form" onSubmit={submit}>
          <div className="nutri-form-grid">
            <label>
              Nome de exibição
              <input
                required
                minLength={2}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              CRN
              <input
                value={form.crn}
                onChange={(e) => setForm({ ...form, crn: e.target.value })}
              />
            </label>
            <label>
              Contato profissional
              <input
                value={form.contact}
                onChange={(e) => setForm({ ...form, contact: e.target.value })}
              />
            </label>
          </div>
          <label>
            Apresentação profissional
            <textarea
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
            />
          </label>
          <p className="nutri-muted">
            Os dados profissionais são exibidos separadamente da sua conta de
            acesso.
          </p>
          <button className="nutri-primary" disabled={!loaded || busy}>
            {busy ? "Salvando..." : "Salvar perfil"}
          </button>
          {message && <p role="status">{message}</p>}
        </form>
      </section>
    </>
  );
}
