import { PanelHeader } from "../components/PanelHeader";
import { patientMock } from "../mocks/patient-data";

export function ProfileSection() {
  return (
    <article className="patient-panel section-panel">
      <PanelHeader eyebrow="Seus dados" title="Perfil do paciente" />
      <div className="profile-hero">
        <span>CF</span>
        <div>
          <strong>{patientMock.fullName}</strong>
          <small>{patientMock.email}</small>
        </div>
        <span className="status-pill">Acompanhamento ativo</span>
      </div>
      <dl className="profile-data">
        <div><dt>Nome completo</dt><dd>{patientMock.fullName}</dd></div>
        <div><dt>E-mail</dt><dd>{patientMock.email}</dd></div>
        <div><dt>Nutricionista responsável</dt><dd>{patientMock.nutritionist}</dd></div>
        <div><dt>Próxima consulta</dt><dd>{patientMock.nextAppointment}</dd></div>
      </dl>
    </article>
  );
}
