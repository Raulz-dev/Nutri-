import { AccountCpf } from "../../users/AccountCpf";
import { PatientIcon } from "../components/PatientIcon";
import { PanelHeader } from "../components/PanelHeader";
import { usePatientData } from "../usePatientData";
import { usePatientClinical } from "../../care/PatientClinicalContext";

export function ProfileSection({ onLogout }: { onLogout: () => Promise<void> }) {
  const { view: patientData, owner } = usePatientData();
  const clinical = usePatientClinical();
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
        <div><dt>Próxima consulta</dt><dd>{clinical.appointmentLoading ? "Carregando..." : clinical.appointmentError ? "Indisponível" : patientData.appointment ? `${patientData.appointment.date}, ${patientData.appointment.time}` : "Nenhuma consulta agendada"}</dd></div>
      </dl>
      <AccountCpf />
      <button className="patient-profile-logout" type="button" onClick={onLogout}>
        <PatientIcon name="logout" />
        <span>Sair da conta</span>
      </button>
    </article>
  );
}
