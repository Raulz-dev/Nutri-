import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../auth/useAuth";
import { getPatient, type PatientRow } from "../../care/api";
import { ErrorToast } from "../../../components/ui/ErrorToast";

export function ReadOnlyPatientPreview() {
  const { patientId = "" } = useParams();
  const { session } = useAuth();
  const [patient, setPatient] = useState<PatientRow | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    getPatient(session?.accessToken ?? "", patientId).then(p => { if(active) setPatient(p); })
      .catch(e => { if(active) setError(e instanceof Error ? e.message : "Paciente indisponível."); });
    return () => { active = false; };
  }, [session?.accessToken, patientId]);
  return <main className="patient-app"><section className="nutri-card" style={{margin:"auto",maxWidth:680}}>
    <Link to="/app/nutricionista/pacientes">← Meus pacientes</Link>
    <ErrorToast message={error} />
    {error ? null : patient ? <>
      <h1>{patient.name}</h1><p>{patient.email}</p><p>Responsável: {patient.nutritionist_name ?? "Sem vínculo"}</p>
      <p>Prévia somente leitura. Os registros clínicos serão integrados nas próximas entregas.</p>
    </> : <p>Carregando paciente...</p>}
  </section></main>;
}
