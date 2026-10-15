import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ErrorToast, useSuccessToast } from "../../../components/ui/ErrorToast";
import { TablePagination } from "../../../components/shared/TablePagination";
import { useAuth } from "../../auth/useAuth";
import { getPatient, type PatientRow } from "../../care/api";
import { closeMealPlan, listPlanHistory, type MealPlanRecord } from "../../care/meal-plan-api";
import {
  saveFollowUp, saveMeasurement, getIntake, getWeightGoal, listFollowUps,
  listMeasurements, measurementOverview, saveWeightGoal,
  type ClinicalFollowUp, type ClinicalMeasurement, type IntakeRecord, type WeightGoalRecord,
} from "../../care/clinical-api";
import { EvolutionChart } from "../../care/EvolutionChart";
import { dateLabel, today } from "../../../lib/formatters";
import { PatientPreferences } from "../components/PatientPreferences";
import { PlanEditor } from "../components/PlanEditor";
import { useAutoSave } from "../../../hooks/useAutoSave";
import { Modal } from "../components/Modal";

const steps = ["Rotina", "Evolução", "Plano alimentar", "Avaliação"];

export function ClinicalPatientPage() {
  const { patientId = "" } = useParams();
  return <ClinicalPatientContent key={patientId} patientId={patientId} />;
}

function ClinicalPatientContent({ patientId }: { patientId: string }) {
  const { session } = useAuth();
  const token = session?.accessToken ?? "";
  const [step, setStep] = useState(0);
  const [patient, setPatient] = useState<PatientRow | null>(null);
  const [intake, setIntake] = useState<IntakeRecord | null>(null);
  const [measurements, setMeasurements] = useState<ClinicalMeasurement[]>([]);
  const [recentMeasurements, setRecentMeasurements] = useState<ClinicalMeasurement[]>([]);
  const [measurementTotal, setMeasurementTotal] = useState(0);
  const [measurementPage, setMeasurementPage] = useState(1);
  const [followUps, setFollowUps] = useState<ClinicalFollowUp[]>([]);
  const [followUpTotal, setFollowUpTotal] = useState(0);
  const [assessmentPage, setAssessmentPage] = useState(1);
  const [goal, setGoal] = useState<WeightGoalRecord | null>(null);
  const [goalValue, setGoalValue] = useState("");
  const [plans, setPlans] = useState<MealPlanRecord[]>([]);
  const [planTotal, setPlanTotal] = useState(0);
  const [planPage, setPlanPage] = useState(1);
  const [editor, setEditor] = useState<MealPlanRecord | "new" | null>(null);
  const [closing, setClosing] = useState<MealPlanRecord | null>(null);
  const [date, setDate] = useState(today());
  const [weight, setWeight] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [measurementNote, setMeasurementNote] = useState("");
  const [assessment, setAssessment] = useState("");
  const [measurementId, setMeasurementId] = useState(() => crypto.randomUUID());
  const [assessmentId, setAssessmentId] = useState(() => crypto.randomUUID());
  const goalRevision = useRef(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [planLoading, setPlanLoading] = useState(true);
  const [error, setError] = useState("");
  const [planError, setPlanError] = useState("");
  const showSuccess = useSuccessToast();
  const requestSequence = useRef(0);
  const planRequestSequence = useRef(0);
  const goalDraftDirty = useRef(false);

  useEffect(() => {
    goalDraftDirty.current = false;
    setStep(0);
  }, [patientId]);

  const load = useCallback(async (measurementPageNumber: number, assessmentPageNumber: number) => {
    const requestId = ++requestSequence.current;
    const [person, preferences, weightGoal, measured, notes, overview] = await Promise.all([
      getPatient(token, patientId), getIntake(token, patientId), getWeightGoal(token, patientId),
      listMeasurements(token, patientId, (measurementPageNumber - 1) * 10),
      listFollowUps(token, patientId, (assessmentPageNumber - 1) * 10),
      measurementOverview(token, patientId),
    ]);
    if (requestId !== requestSequence.current) return;
    setPatient(person);
    setIntake(preferences);
    setGoal(weightGoal);
    goalRevision.current = Math.max(goalRevision.current, weightGoal.revision);
    if (!goalDraftDirty.current) setGoalValue(weightGoal.target_kg?.toString() ?? "");
    setMeasurements(measured.items);
    setMeasurementTotal(measured.total);
    setRecentMeasurements(overview.recent);
    setFollowUps(notes.items);
    setFollowUpTotal(notes.total);
  }, [token, patientId]);

  const loadPlans = useCallback(async (pageNumber: number) => {
    const requestId = ++planRequestSequence.current;
    const result = await listPlanHistory(token, patientId, (pageNumber - 1) * 10);
    if (requestId !== planRequestSequence.current) return;
    setPlans(result.items);
    setPlanTotal(result.total);
    setPlanError("");
  }, [token, patientId]);

  useEffect(() => {
    let active = true;
    setPatient(null);
    setLoading(true);
    setError("");
    load(measurementPage, assessmentPage).catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : "Paciente indisponível.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; requestSequence.current += 1; };
  }, [load, measurementPage, assessmentPage]);

  useEffect(() => {
    let active = true;
    setPlans([]);
    setPlanTotal(0);
    setPlanLoading(true);
    setPlanError("");
    loadPlans(planPage).catch(reason => {
      if (active) setPlanError(reason instanceof Error ? reason.message : "Não foi possível carregar os planos.");
    }).finally(() => { if (active) setPlanLoading(false); });
    return () => { active = false; planRequestSequence.current += 1; };
  }, [loadPlans, planPage]);

  const chartMeasurements = useMemo(() => [...recentMeasurements].reverse().map(row => ({
    id: row.id, patientId: row.patient_id, authorId: row.author_id,
    authorName: row.author_name, date: row.measured_on,
    weight: row.weight_kg, bodyFat: row.body_fat_pct, note: row.note,
  })), [recentMeasurements]);

  const validDecimal = (value: string, min: number, max: number) =>
    value.trim() !== "" && /^\d+(?:\.\d)?$/.test(value) && Number(value) >= min && Number(value) <= max;
  const measurementValid = Boolean(date) && date <= today() && validDecimal(weight, 0.1, 500)
    && (!bodyFat || validDecimal(bodyFat, 0, 100));
  const measurementSave = useAutoSave(
    measurementValid ? JSON.stringify([measurementId, date, weight, bodyFat, measurementNote]) : null,
    async () => {
      await saveMeasurement(token, patientId, measurementId, {
        measured_on: date, weight_kg: Number(weight),
        body_fat_pct: bodyFat ? Number(bodyFat) : null, note: measurementNote,
      });
      const [result, overview] = await Promise.all([
        listMeasurements(token, patientId, (measurementPage - 1) * 10),
        measurementOverview(token, patientId),
      ]);
      setMeasurements(result.items);
      setMeasurementTotal(result.total);
      setRecentMeasurements(overview.recent);
    },
  );
  const assessmentSave = useAutoSave(
    assessment.trim() ? JSON.stringify([assessmentId, assessment]) : null,
    async () => {
      await saveFollowUp(token, patientId, assessmentId, assessment);
      const result = await listFollowUps(token, patientId, (assessmentPage - 1) * 10);
      setFollowUps(result.items);
      setFollowUpTotal(result.total);
    },
  );
  const goalSave = useAutoSave(
    goalDraftDirty.current && validDecimal(goalValue, 0.1, 500) ? goalValue : null,
    async () => {
      const saved = await saveWeightGoal(token, patientId, Number(goalValue), goalRevision.current);
      goalRevision.current = saved.revision;
      setGoal(saved);
    },
  );

  function refreshPlans() {
    if (planPage !== 1) {
      setPlanPage(1);
      return;
    }
    void loadPlans(1).catch(reason => {
      setPlanError(reason instanceof Error ? reason.message : "Não foi possível atualizar os planos.");
    });
  }

  async function confirmClosePlan() {
    if (!closing || busy) return;
    setBusy(true); setError("");
    try {
      const closed = await closeMealPlan(token, patientId, closing.id, closing.revision);
      setPlans(current => current.map(plan => plan.id === closed.id ? closed : plan));
      setClosing(null);
      showSuccess("Plano encerrado e preservado no histórico.");
      refreshPlans();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível encerrar o plano.");
    } finally { setBusy(false); }
  }

  function planStatus(plan: MealPlanRecord) {
    if (plan.status === "draft") return "Rascunho";
    if (plan.status === "closed") return "Encerrado";
    if (plan.startDate > today()) return "Programado";
    if (plan.effectiveEndOn && plan.effectiveEndOn < today()) return "Substituído ou vencido";
    return "Vigente";
  }

  return <>
    <Link to="/app/nutricionista/pacientes">← Meus pacientes</Link>
    <ErrorToast message={error} />
    <ErrorToast message={planError} />
    {loading ? <p>Carregando acompanhamento...</p> : !patient ? <p>Paciente indisponível.</p> : <>
      <header className="nutri-heading">
        <span>ACOMPANHAMENTO</span><h1>{patient.name}</h1><p>{patient.email}</p>
        <Link to={`/app/nutricionista/pacientes/${patientId}/previa`}>Abrir prévia somente leitura →</Link>
      </header>

      <nav className="nutri-care-steps" aria-label="Etapas do acompanhamento">
        {steps.map((label, index) => <button
          key={label}
          type="button"
          aria-current={step === index ? "step" : undefined}
          aria-controls={`care-step-${index}`}
          onClick={() => setStep(index)}
        ><span aria-hidden="true">{index + 1}</span>{label}</button>)}
      </nav>
      <div id="care-step-0" hidden={step !== 0} role="region" aria-label="1. Rotina">
      {intake?.intake ? <PatientPreferences intake={intake.intake} /> : <section className="nutri-card"><h2>Preferências e rotina</h2><p>O paciente ainda não preencheu as preferências.</p></section>}
      </div>
      <div id="care-step-1" hidden={step !== 1} role="region" aria-label="2. Evolução">
      <section className="nutri-card">
        <h2>Evolução</h2>
        <form className="nutri-form" onSubmit={event => { event.preventDefault(); void goalSave.flush(); }} onBlur={() => { void goalSave.flush(); }}>
          <h3>Meta de peso</h3>
          <label>Meta (kg)<input type="number" min="0.1" max="500" step="0.1" required value={goalValue} onChange={event => { goalDraftDirty.current = true; setGoalValue(event.target.value); }} /></label>
          {goal?.author_name && <p>Última definição por {goal.author_name}.</p>}
          <AutoSaveStatus state={goalSave} />
        </form>
        <EvolutionChart measurements={chartMeasurements} />
        <form className="nutri-form" onSubmit={event => { event.preventDefault(); void measurementSave.flush(); }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) void measurementSave.flush(); }}>
          <h3>Registrar medição</h3>
          <div className="nutri-form-grid">
            <label>Data<input type="date" required max={today()} value={date} onChange={event => setDate(event.target.value)} /></label>
            <label>Peso (kg)<input type="number" min="0.1" max="500" step="0.1" required value={weight} onChange={event => setWeight(event.target.value)} /></label>
            <label>Gordura corporal (%)<input type="number" min="0" max="100" step="0.1" value={bodyFat} onChange={event => setBodyFat(event.target.value)} /></label>
            <label>Observação<input maxLength={2000} value={measurementNote} onChange={event => setMeasurementNote(event.target.value)} /></label>
          </div>
          <AutoSaveStatus state={measurementSave} />
          {measurementSave.status === "saved" && <button type="button" onClick={() => {
            setMeasurementId(crypto.randomUUID()); setWeight(""); setBodyFat(""); setMeasurementNote(""); setDate(today());
          }}>Nova medição</button>}
        </form>
        <div className="nutri-table-card"><table><thead><tr><th>Data</th><th>Peso</th><th>Gordura</th><th>Observação / autor</th></tr></thead><tbody>
          {measurements.map(row => <tr key={row.id}>
            <td data-label="Data">{dateLabel(row.measured_on)}</td>
            <td data-label="Peso">{row.weight_kg.toLocaleString("pt-BR")} kg</td>
            <td data-label="Gordura">{row.body_fat_pct === null ? "—" : `${row.body_fat_pct.toLocaleString("pt-BR")}%`}</td>
            <td data-label="Registro">{row.note || "—"}<small>{row.author_name}</small></td>
          </tr>)}
          {!measurementTotal && <tr><td colSpan={4} className="nutri-empty">Nenhuma medição registrada.</td></tr>}
        </tbody></table><TablePagination page={measurementPage} totalPages={Math.max(1, Math.ceil(measurementTotal / 10))} onPageChange={setMeasurementPage} /></div>
      </section>
      </div>
      <div id="care-step-2" hidden={step !== 2} role="region" aria-label="3. Plano alimentar">
      <section className="nutri-card">
        <header><h2>Planos alimentares</h2><button className="nutri-primary" type="button" onClick={() => setEditor("new")}>Criar plano</button></header>
        {planLoading && <p className="nutri-muted">Carregando planos...</p>}
        {!planLoading && planError && <button type="button" onClick={refreshPlans}>Tentar novamente</button>}
        {plans.map(plan => <article className="nutri-plan-summary" key={plan.id}>
          <div>
            <span className="nutri-badge">{planStatus(plan)}</span>
            <h3>{plan.title}</h3>
            <p>{dateLabel(plan.startDate)} a {dateLabel(plan.endDate)} · {plan.authorName}</p>
            <p>{plan.meals.length} refeições · {plan.meals.reduce((sum, meal) => sum + meal.calories, 0).toLocaleString("pt-BR")} kcal/dia</p>
            <details><summary>Ver conteúdo do plano</summary>
              {plan.guidance && <p>{plan.guidance}</p>}
              {plan.meals.map(meal => <div key={meal.id}>
                <strong>{meal.time} · {meal.title}</strong>
                <p>{meal.foods.map(food => `${food.name} (${food.grams} g)`).join(", ")}</p>
                {meal.substitutions.map((option, index) => <p key={option.id}>Opção {index + 1}: {option.foods.map(food => `${food.name} (${food.grams} g)`).join(", ")}</p>)}
              </div>)}
            </details>
          </div>
          <div className="nutri-actions">
            <button type="button" onClick={() => setEditor(plan)}>{plan.status === "draft" ? "Editar rascunho" : "Criar nova versão"}</button>
            {plan.status === "published" && <button type="button" onClick={() => setClosing(plan)}>Encerrar plano</button>}
          </div>
        </article>)}
        {!planLoading && !planError && !planTotal && <p className="nutri-empty">Nenhum plano alimentar criado.</p>}
        <TablePagination page={planPage} totalPages={Math.max(1, Math.ceil(planTotal / 10))} onPageChange={setPlanPage} />
      </section>
      </div>
      <div id="care-step-3" hidden={step !== 3} role="region" aria-label="4. Avaliação">
      <section className="nutri-card">
        <h2>Avaliações</h2>
        <form className="nutri-form" onSubmit={event => { event.preventDefault(); void assessmentSave.flush(); }} onBlur={() => { void assessmentSave.flush(); }}>
          <label>Nova avaliação<textarea value={assessment} onChange={event => setAssessment(event.target.value)} required maxLength={4000} /></label>
          <AutoSaveStatus state={assessmentSave} />
          {assessmentSave.status === "saved" && <button type="button" onClick={() => {
            setAssessmentId(crypto.randomUUID()); setAssessment("");
          }}>Nova avaliação</button>}
        </form>
        {followUps.map(row => <article className="nutri-record" key={row.id}>
          <small>{new Date(row.created_at).toLocaleString("pt-BR")} · {row.author_name}</small><p>{row.text}</p>
        </article>)}
        {!followUpTotal && <p className="nutri-empty">Nenhuma avaliação registrada.</p>}
        <TablePagination page={assessmentPage} totalPages={Math.max(1, Math.ceil(followUpTotal / 10))} onPageChange={setAssessmentPage} />
      </section>
      </div>
      <div className="nutri-actions nutri-care-navigation">
        <button type="button" disabled={step === 0} onClick={() => setStep(current => current - 1)}>Anterior</button>
        <span>Etapa {step + 1} de {steps.length}</span>
        {step < steps.length - 1 && <button type="button" onClick={() => setStep(current => current + 1)}>Próxima: {steps[step + 1]}</button>}
      </div>
    </>}
    {editor && <PlanEditor patientId={patientId} source={editor === "new" ? undefined : editor} onClose={() => setEditor(null)} onSaved={refreshPlans} />}
    {closing && <Modal title="Encerrar plano alimentar" onClose={() => { if (!busy) setClosing(null); }}>
      <p>Encerrar “{closing.title}”? O conteúdo ficará no histórico e deixará de aparecer ao paciente.</p>
      <div className="nutri-actions"><button type="button" disabled={busy} onClick={() => setClosing(null)}>Cancelar</button><button className="nutri-primary" type="button" disabled={busy} onClick={confirmClosePlan}>Confirmar encerramento</button></div>
    </Modal>}
  </>;
}

function AutoSaveStatus({ state }: { state: ReturnType<typeof useAutoSave> }) {
  return <div>
    <p role="status" className="nutri-muted">{state.status === "saving" ? "Salvando…" : state.status === "saved" ? "Salvo automaticamente." : state.status === "pending" ? "Alterações aguardando salvamento…" : state.status === "error" ? "Não foi possível salvar. Seus dados continuam no formulário." : "Preencha os campos para salvar automaticamente."}</p>
    <ErrorToast message={state.error} />
    {state.status === "error" && <button type="button" onClick={() => { void state.flush(); }}>Tentar novamente</button>}
  </div>;
}
