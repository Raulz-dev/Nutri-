import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../auth/useAuth";
import { getPatient, type PatientRow } from "../../care/api";
import { getIntake, measurementOverview, type ClinicalMeasurement, type IntakeRecord } from "../../care/clinical-api";
import { EvolutionChart } from "../../demo/EvolutionChart";
import { ErrorToast } from "../../../components/ui/ErrorToast";
import { PatientPreferences } from "../components/PatientPreferences";

export function ReadOnlyPatientPreview() {
  const { patientId = "" } = useParams();
  const { session } = useAuth();
  const token = session?.accessToken ?? "";
  const [patient, setPatient] = useState<PatientRow | null>(null);
  const [intake, setIntake] = useState<IntakeRecord | null>(null);
  const [measurements, setMeasurements] = useState<ClinicalMeasurement[]>([]);
  const [measurementTotal, setMeasurementTotal] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setPatient(null); setError(""); setLoading(true);
    Promise.all([getPatient(token, patientId), getIntake(token, patientId), measurementOverview(token, patientId)])
      .then(([person, preferences, overview]) => {
        if (active) { setPatient(person); setIntake(preferences); setMeasurements(overview.recent); setMeasurementTotal(overview.total); }
      })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Paciente indisponível."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, patientId]);
  const chartMeasurements = useMemo(() => [...measurements].reverse().map(row => ({
    id: row.id, patientId: row.patient_id, authorId: row.author_id,
    authorName: row.author_name, date: row.measured_on,
    weight: row.weight_kg, bodyFat: row.body_fat_pct, note: row.note,
  })), [measurements]);
  return <main className="patient-app"><section className="nutri-card" style={{margin:"auto",maxWidth:900}}>
    <Link to={`/app/nutricionista/pacientes/${patientId}`}>← Voltar ao acompanhamento</Link>
    <ErrorToast message={error} />
    {loading ? <p>Carregando prévia...</p> : patient ? <>
      <h1>{patient.name}</h1><p>{patient.email}</p><p>Responsável: {patient.nutritionist_name ?? "Sem vínculo"}</p>
      <p>Prévia somente leitura dos dados preenchidos e da evolução do paciente.</p>
      {intake?.intake ? <PatientPreferences intake={intake.intake} /> : <p>Preferências ainda não preenchidas.</p>}
      <EvolutionChart measurements={chartMeasurements} />
      <p>{measurementTotal} {measurementTotal === 1 ? "medição registrada" : "medições registradas"}.</p>
    </> : <p>Paciente indisponível.</p>}
  </section></main>;
}
