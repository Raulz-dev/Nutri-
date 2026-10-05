import { useState, type FormEvent } from "react";
import { useAuth } from "../../auth/useAuth";
import { useDemo } from "../../demo/store";
import { saveProfessionalProfile } from "../../demo/actions";
export function NutritionistProfilePage() {
  const { currentUser } = useAuth();
  const state = useDemo();
  const [form, setForm] = useState(
    () =>
      state.profiles[currentUser!.id] ?? {
        name: currentUser!.name,
        crn: "",
        contact: "",
        bio: "",
      },
  );
  const [message, setMessage] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    try {
      saveProfessionalProfile(form, currentUser!);
      setMessage("Perfil demonstrativo salvo.");
    } catch (error) {
      setMessage(
        (error as Error).message || "Não foi possível salvar neste navegador.",
      );
    }
  }
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
            Esta edição é demonstrativa e não altera o e-mail ou a senha usados
            no login.
          </p>
          <button className="nutri-primary">Salvar perfil</button>
          {message && <p role="status">{message}</p>}
        </form>
      </section>
    </>
  );
}
