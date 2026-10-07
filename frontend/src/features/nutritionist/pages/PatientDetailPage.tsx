import { useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/useAuth";
import {
  activePlan,
  dateLabel,
  demoUsers,
  nextAppointment,
  today,
  useDemo,
} from "../../demo/store";
import { closePlan, saveFollowUp } from "../../demo/actions";
import type { Plan } from "../../demo/types";
import { emptyPatientIntake } from "../../patient/patient-intake";
import { TablePagination } from "../../../components/shared/TablePagination";
import { ErrorToast } from "../../../components/ui/ErrorToast";
import { usePagination } from "../../../hooks/usePagination";
import { PlanEditor } from "../components/PlanEditor";
import { PatientEvolution } from "../components/PatientEvolution";
import {
  PatientPreferences,
  goalLabels,
} from "../components/PatientPreferences";
import { Modal } from "../components/Modal";
const tabs = [
  ["resumo", "Resumo"],
  ["preferencias", "Preferências"],
  ["plano", "Plano alimentar"],
  ["evolucao", "Evolução"],
] as const;
export function NutritionistPatientDetailPage() {
  const { patientId = "" } = useParams();
  const { currentUser } = useAuth();
  const state = useDemo();
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get("aba");
  const tab = tabs.some(([id]) => id === requestedTab)
    ? requestedTab
    : "resumo";
  const patient = demoUsers(state).find((u) => u.id === patientId);
  const [editor, setEditor] = useState<Plan | "new" | null>(null);
  const [closing, setClosing] = useState<Plan | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const plans = state.plans
    .filter(
      (p) =>
        p.patientId === patientId &&
        (p.status !== "draft" || p.authorId === currentUser!.id),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const planPages = usePagination(plans, patientId);
  const records = state.followUps
    .filter((n) => n.patientId === patientId)
    .sort((a, b) => b.date.localeCompare(a.date));
  const recordPages = usePagination(records, patientId);
  const intake = state.intakes[patientId] ?? emptyPatientIntake;
  const appointment = nextAppointment(state, patientId);
  if (
    !patient ||
    !state.links.some(
      (l) => l.patientId === patientId && l.nutritionistId === currentUser!.id,
    )
  )
    return (
      <section className="nutri-card">
        <h1>Paciente indisponível</h1>
        <p>Este paciente não está vinculado a você.</p>
        <Link to="/app/nutricionista/pacientes">Voltar aos pacientes</Link>
      </section>
    );
  function addNote(e: FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    try {
      saveFollowUp(patientId, note, currentUser!);
      setNote("");
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <Link to="/app/nutricionista/pacientes">← Meus pacientes</Link>
      <header className="nutri-heading">
        <h1>{patient.name}</h1>
        <p>{patient.email}</p>
        <div className="nutri-actions">
          <Link
            className="nutri-primary"
            to={`/app/nutricionista/pacientes/${patientId}/previa`}
          >
            Ver como paciente
          </Link>
          <Link to={`/app/nutricionista/mensagens?paciente=${patientId}`}>
            Abrir conversa
          </Link>
        </div>
      </header>
      <nav className="nutri-tabs" aria-label="Detalhes do paciente">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => setParams({ aba: id })}
          >
            {label}
          </button>
        ))}
      </nav>
      <ErrorToast message={error} />
      {tab === "resumo" && (
        <>
          <div className="nutri-columns">
            <section className="nutri-card">
              <h2>Acompanhamento</h2>
              <dl className="nutri-details">
                <dt>Objetivo</dt>
                <dd>
                  {intake.goal.details ||
                    goalLabels[intake.goal.primary] ||
                    "Ainda não informado"}
                </dd>
                <dt>Responsável</dt>
                <dd>
                  {state.profiles[currentUser!.id]?.name || currentUser!.name}
                </dd>
                <dt>Plano alimentar</dt>
                <dd>
                  {activePlan(state, patientId)?.title ?? "Nenhum plano ativo"}
                </dd>
              </dl>
            </section>
            <section className="nutri-card">
              <h2>Próxima consulta</h2>
              <p>
                {appointment
                  ? `${dateLabel(appointment.date)} às ${appointment.time}`
                  : "Nenhuma consulta agendada"}
              </p>
              <Link to={`/app/nutricionista/consultas?paciente=${patientId}`}>
                Gerenciar consultas →
              </Link>
            </section>
          </div>
          <section className="nutri-card">
            <h2>Registros de acompanhamento</h2>
            <form className="nutri-form" onSubmit={addNote}>
              <label>
                Nova observação
                <textarea
                  required
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              <button className="nutri-primary">Salvar observação</button>
            </form>
            {recordPages.items.map((n) => (
              <article className="nutri-record" key={n.id}>
                <small>
                  {new Date(n.date).toLocaleString("pt-BR")} · {n.authorName}
                </small>
                <p>{n.text}</p>
              </article>
            ))}
            {!records.length && (
              <p className="nutri-empty">Nenhum registro de acompanhamento.</p>
            )}
            <TablePagination {...recordPages} />
          </section>
        </>
      )}
      {tab === "preferencias" && <PatientPreferences intake={intake} />}
      {tab === "plano" && (
        <section className="nutri-card">
          <header>
            <h2>Planos alimentares</h2>
            <button className="nutri-primary" onClick={() => setEditor("new")}>
              Criar plano
            </button>
          </header>
          {planPages.items.map((p) => (
            <article className="nutri-plan-summary" key={p.id}>
              <div>
                <span className="nutri-badge">
                  {p.status === "draft"
                    ? "Rascunho"
                    : p.status === "closed"
                      ? "Encerrado"
                      : p.endDate < today()
                        ? "Vencido"
                        : "Ativo"}
                </span>
                <h3>{p.title}</h3>
                <p>
                  {dateLabel(p.startDate)} a {dateLabel(p.endDate)} ·{" "}
                  {p.authorName}
                </p>
                <p>
                  {p.meals.length} refeições ·{" "}
                  {p.meals.reduce((sum, m) => sum + m.calories, 0)} kcal/dia
                </p>
                <details>
                  <summary>Ver conteúdo do plano</summary>
                  <p>{p.guidance}</p>
                  {p.meals.map((m) => (
                    <div key={m.id}>
                      <strong>
                        {m.time} · {m.title}
                      </strong>
                      <p>
                        {m.foods
                          .map((f) => `${f.name} (${f.grams} g)`)
                          .join(", ")}
                      </p>
                      {m.substitutions.map((s, i) => (
                        <p key={s.id}>
                          Opção {i + 1}:{" "}
                          {s.foods
                            .map((f) => `${f.name} (${f.grams} g)`)
                            .join(", ")}
                        </p>
                      ))}
                    </div>
                  ))}
                </details>
              </div>
              <div className="nutri-actions">
                <button onClick={() => setEditor(p)}>
                  {p.status === "draft"
                    ? "Editar rascunho"
                    : "Criar nova versão"}
                </button>
                {p.status === "published" && (
                  <button onClick={() => setClosing(p)}>Encerrar plano</button>
                )}
              </div>
            </article>
          ))}
          {!plans.length && (
            <p className="nutri-empty">Nenhum plano alimentar criado.</p>
          )}
          <TablePagination {...planPages} />
        </section>
      )}
      {tab === "evolucao" && <PatientEvolution patientId={patientId} />}
      {editor && (
        <PlanEditor
          patientId={patientId}
          source={editor === "new" ? undefined : editor}
          onClose={() => setEditor(null)}
        />
      )}
      {closing && (
        <Modal
          title="Encerrar plano alimentar"
          onClose={() => setClosing(null)}
        >
          <p>
            Encerrar “{closing.title}”? O conteúdo será preservado no histórico
            e deixará de aparecer como plano ativo.
          </p>
          <div className="nutri-actions">
            <button onClick={() => setClosing(null)}>Cancelar</button>
            <button
              className="nutri-primary"
              onClick={() => {
                try {
                  closePlan(closing.id, currentUser!);
                  setClosing(null);
                } catch (e) {
                  setError((e as Error).message);
                  setClosing(null);
                }
              }}
            >
              Confirmar encerramento
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
