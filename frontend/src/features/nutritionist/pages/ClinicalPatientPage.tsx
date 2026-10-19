import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ErrorToast } from "../../../components/ui/ErrorToast";
import { useAuth } from "../../auth/useAuth";
import { getPatient, type PatientRow } from "../../care/api";
import { getIntake, type IntakeRecord } from "../../care/clinical-api";
import { PatientPreferences } from "../components/PatientPreferences";
import { EvolutionStep } from "../components/clinical/EvolutionStep";
import { AssessmentStep } from "../components/clinical/AssessmentStep";
import { MealPlansStep } from "../components/clinical/MealPlansStep";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([getPatient(token, patientId), getIntake(token, patientId)])
      .then(([person, preferences]) => {
        if (!active) return;
        setPatient(person);
        setIntake(preferences);
      })
      .catch((reason) => {
        if (active)
          setError(
            reason instanceof Error ? reason.message : "Paciente indisponível.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, patientId]);

  return (
    <>
      <Link to="/app/nutricionista/pacientes">← Meus pacientes</Link>
      <ErrorToast message={error} />
      {loading ? (
        <p>Carregando acompanhamento...</p>
      ) : !patient ? (
        <p>Paciente indisponível.</p>
      ) : (
        <>
          <header className="nutri-heading">
            <span>ACOMPANHAMENTO</span>
            <h1>{patient.name}</h1>
            <p>{patient.email}</p>
            <Link to={`/app/nutricionista/pacientes/${patientId}/previa`}>
              Abrir prévia somente leitura →
            </Link>
          </header>
          <nav
            className="nutri-care-steps"
            aria-label="Etapas do acompanhamento"
          >
            {steps.map((label, index) => (
              <button
                key={label}
                type="button"
                aria-current={step === index ? "step" : undefined}
                aria-controls={`care-step-${index}`}
                onClick={() => setStep(index)}
              >
                <span aria-hidden="true">{index + 1}</span>
                {label}
              </button>
            ))}
          </nav>
          {/* Keep steps mounted so navigation preserves drafts and autosave queues. */}
          <div
            id="care-step-0"
            hidden={step !== 0}
            role="region"
            aria-label="1. Rotina"
          >
            {intake?.intake ? (
              <PatientPreferences intake={intake.intake} />
            ) : (
              <section className="nutri-card">
                <h2>Preferências e rotina</h2>
                <p>O paciente ainda não preencheu as preferências.</p>
              </section>
            )}
          </div>
          <div
            id="care-step-1"
            hidden={step !== 1}
            role="region"
            aria-label="2. Evolução"
          >
            <EvolutionStep token={token} patientId={patientId} />
          </div>
          <div
            id="care-step-2"
            hidden={step !== 2}
            role="region"
            aria-label="3. Plano alimentar"
          >
            <MealPlansStep token={token} patientId={patientId} />
          </div>
          <div
            id="care-step-3"
            hidden={step !== 3}
            role="region"
            aria-label="4. Avaliação"
          >
            <AssessmentStep token={token} patientId={patientId} />
          </div>
          <div className="nutri-actions nutri-care-navigation">
            <button
              type="button"
              disabled={step === 0}
              onClick={() => setStep((current) => current - 1)}
            >
              Anterior
            </button>
            <span>
              Etapa {step + 1} de {steps.length}
            </span>
            {step < steps.length - 1 && (
              <button
                type="button"
                onClick={() => setStep((current) => current + 1)}
              >
                Próxima: {steps[step + 1]}
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
}
