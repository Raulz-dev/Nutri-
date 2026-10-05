import { PanelHeader } from "../components/PanelHeader";
import { usePatientData } from "../../demo/PatientContext";

export function ProfileSection() {
  const { view: patientData, owner } = usePatientData();
  return (
    <article className="patient-panel section-panel">
      <PanelHeader eyebrow="Seus dados" title="Perfil do paciente" />
      <div className="profile-hero">
        <span>{patientData.name.slice(0, 2).toUpperCase()}</span>
        <div>
          <strong>{patientData.fullName}</strong>
          <small>{patientData.email}</small>
        </div>
        <span className="status-pill">{owner ? "Acompanhamento ativo" : "Aguardando nutricionista"}</span>
      </div>
      <dl className="profile-data">
        <div><dt>Nome completo</dt><dd>{patientData.fullName}</dd></div>
        <div><dt>E-mail</dt><dd>{patientData.email}</dd></div>
        <div><dt>Nutricionista responsável</dt><dd>{patientData.nutritionist}</dd></div>
        <div><dt>Próxima consulta</dt><dd>{patientData.appointment ? `${patientData.appointment.date}, ${patientData.appointment.time}` : "Nenhuma consulta agendada"}</dd></div>
      </dl>
    </article>
  );
}
