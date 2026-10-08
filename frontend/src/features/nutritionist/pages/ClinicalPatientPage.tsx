import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ErrorToast } from "../../../components/ui/ErrorToast";
import { TablePagination } from "../../../components/shared/TablePagination";
import { useAuth } from "../../auth/useAuth";
import { getPatient, type PatientRow } from "../../care/api";
import {
  addFollowUp, addMeasurement, getIntake, getWeightGoal, listFollowUps,
  listMeasurements, measurementOverview, saveWeightGoal,
  type ClinicalFollowUp, type ClinicalMeasurement, type IntakeRecord, type WeightGoalRecord,
} from "../../care/clinical-api";
import { EvolutionChart } from "../../demo/EvolutionChart";
import { dateLabel, today } from "../../demo/store";
import { PatientPreferences } from "../components/PatientPreferences";

export function ClinicalPatientPage() {
  const { patientId = "" } = useParams();
  const { session } = useAuth();
  const token = session?.accessToken ?? "";
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
  const [date, setDate] = useState(today());
  const [weight, setWeight] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [measurementNote, setMeasurementNote] = useState("");
  const [assessment, setAssessment] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const requestSequence = useRef(0);
  const goalDraftDirty = useRef(false);

  useEffect(() => {
    goalDraftDirty.current = false;
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
    if (!goalDraftDirty.current) setGoalValue(weightGoal.target_kg?.toString() ?? "");
    setMeasurements(measured.items);
    setMeasurementTotal(measured.total);
    setRecentMeasurements(overview.recent);
    setFollowUps(notes.items);
    setFollowUpTotal(notes.total);
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

  const chartMeasurements = useMemo(() => [...recentMeasurements].reverse().map(row => ({
    id: row.id, patientId: row.patient_id, authorId: row.author_id,
    authorName: row.author_name, date: row.measured_on,
    weight: row.weight_kg, bodyFat: row.body_fat_pct, note: row.note,
  })), [recentMeasurements]);

  async function submitMeasurement(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      await addMeasurement(token, patientId, {
        measured_on: date, weight_kg: Number(weight),
        body_fat_pct: bodyFat ? Number(bodyFat) : null, note: measurementNote,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível registrar a medição.");
      setBusy(false);
      return;
    }
    setWeight(""); setBodyFat(""); setMeasurementNote("");
    setNotice("Medição registrada no histórico.");
    setMeasurementPage(1);
    try {
      await load(1, assessmentPage);
    } catch {
      setError("Medição salva, mas não foi possível atualizar o histórico. Recarregue a página.");
    } finally { setBusy(false); }
  }

  async function submitAssessment(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      await addFollowUp(token, patientId, assessment);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível registrar a avaliação.");
      setBusy(false);
      return;
    }
    setAssessment("");
    setNotice("Avaliação registrada no histórico.");
    setAssessmentPage(1);
    try {
      await load(measurementPage, 1);
    } catch {
      setError("Avaliação salva, mas não foi possível atualizar o histórico. Recarregue a página.");
    } finally { setBusy(false); }
  }

  async function submitGoal(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const saved = await saveWeightGoal(token, patientId, Number(goalValue), goal?.revision ?? 0);
      goalDraftDirty.current = false;
      setGoal(saved);
      setGoalValue(saved.target_kg?.toString() ?? "");
      setNotice("Meta de peso salva na plataforma.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar a meta.");
    } finally { setBusy(false); }
  }

  return <>
    <Link to="/app/nutricionista/pacientes">← Meus pacientes</Link>
    <ErrorToast message={error} />
    {loading ? <p>Carregando acompanhamento...</p> : !patient ? <p>Paciente indisponível.</p> : <>
      <header className="nutri-heading">
        <span>ACOMPANHAMENTO</span><h1>{patient.name}</h1><p>{patient.email}</p>
        <Link to={`/app/nutricionista/pacientes/${patientId}/previa`}>Abrir prévia somente leitura →</Link>
      </header>
      {notice && <p role="status" className="nutri-notice">{notice}</p>}
      <section className="nutri-card">
        <h2>Avaliações</h2>
        <form className="nutri-form" onSubmit={submitAssessment}>
          <label>Nova avaliação<textarea value={assessment} onChange={event => setAssessment(event.target.value)} required maxLength={4000} /></label>
          <button className="nutri-primary" type="submit" disabled={busy || !assessment.trim()}>Salvar avaliação</button>
        </form>
        {followUps.map(row => <article className="nutri-record" key={row.id}>
          <small>{new Date(row.created_at).toLocaleString("pt-BR")} · {row.author_name}</small><p>{row.text}</p>
        </article>)}
        {!followUpTotal && <p className="nutri-empty">Nenhuma avaliação registrada.</p>}
        <TablePagination page={assessmentPage} totalPages={Math.max(1, Math.ceil(followUpTotal / 10))} onPageChange={setAssessmentPage} />
      </section>
      {intake?.intake ? <PatientPreferences intake={intake.intake} /> : <section className="nutri-card"><h2>Preferências e rotina</h2><p>O paciente ainda não preencheu as preferências.</p></section>}
      <section className="nutri-card">
        <h2>Evolução</h2>
        <form className="nutri-form" onSubmit={submitGoal}>
          <h3>Meta de peso</h3>
          <label>Meta (kg)<input type="number" min="0.1" max="500" step="0.1" required value={goalValue} onChange={event => { goalDraftDirty.current = true; setGoalValue(event.target.value); }} /></label>
          {goal?.author_name && <p>Última definição por {goal.author_name}.</p>}
          <button className="nutri-primary" type="submit" disabled={busy}>Salvar meta</button>
        </form>
        <EvolutionChart measurements={chartMeasurements} />
        <form className="nutri-form" onSubmit={submitMeasurement}>
          <h3>Registrar medição</h3>
          <div className="nutri-form-grid">
            <label>Data<input type="date" required max={today()} value={date} onChange={event => setDate(event.target.value)} /></label>
            <label>Peso (kg)<input type="number" min="0.1" max="500" step="0.1" required value={weight} onChange={event => setWeight(event.target.value)} /></label>
            <label>Gordura corporal (%)<input type="number" min="0" max="100" step="0.1" value={bodyFat} onChange={event => setBodyFat(event.target.value)} /></label>
            <label>Observação<input maxLength={2000} value={measurementNote} onChange={event => setMeasurementNote(event.target.value)} /></label>
          </div>
          <button className="nutri-primary" type="submit" disabled={busy}>Salvar medição</button>
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
    </>}
  </>;
}
