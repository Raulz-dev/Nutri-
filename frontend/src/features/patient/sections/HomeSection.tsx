import { useModalBehavior } from "../../../hooks/useModalBehavior";
import { useRef, useState } from "react";

import { PatientIcon, type IconName } from "../components/PatientIcon";
import type { PatientSection } from "../mocks/patient-data";
import { initials } from "../../demo/store";
import { EvolutionChart } from "../../demo/EvolutionChart";
import { usePatientData } from "../../demo/PatientContext";

export function HomeSection({ onNavigate }: { onNavigate: (section: PatientSection) => void }) {
  const { view: patientData, history } = usePatientData();
  const [showAppointment, setShowAppointment] = useState(false);
  const appointmentDialog = useRef<HTMLElement>(null);
  const nextMeal = getNextMeal(patientData.meals);
  useModalBehavior(appointmentDialog, () => setShowAppointment(false), showAppointment);

  return (
    <div className="home-dashboard">
      <section className="health-summary-grid" aria-label="Resumo de saúde">
        <Summary icon="chart" label="Peso atual" value={patientData.currentWeight} detail={patientData.weightChange} />
        <Summary icon="percent" label="Percentual de gordura" value={patientData.bodyFat} detail={patientData.bodyFatChange} />
        <Summary icon="clock" label="Próxima refeição" value={nextMeal?.title ?? "Sem plano"} detail={nextMeal ? `${nextMeal.time}${nextMeal.isTomorrow ? " · amanhã" : ""}` : "Nenhuma refeição publicada"} />
        <Summary icon="water" label="Água diária" value={patientData.mealPlan.dailyWaterGoal} detail="Meta diária do plano" />
        <Summary icon="target" label="Calorias diárias" value={patientData.dailyCalories} detail="Total estimado do plano" />
      </section>

      <section className="dashboard-insights">
        <div>
          <EvolutionChart measurements={history.slice(-4)} />
          <button className="chart-details-button" type="button" onClick={() => onNavigate("progress")}>Ver detalhes <PatientIcon name="arrow" /></button>
        </div>

        {patientData.appointment ? <article className="next-appointment-card">
          <div className="appointment-icon"><PatientIcon name="calendar" /></div>
          <span className="appointment-eyebrow">Próxima consulta</span>
          <h2>{patientData.appointment.date.replace(/ de \d{4}$/, "")}</h2>
          <strong>{patientData.appointment.time}</strong>
          <div className="appointment-professional">
            <span>{initials(patientData.nutritionist)}</span>
            <div>
              <strong>{patientData.nutritionist}</strong>
              <small>{patientData.appointment.type}</small>
            </div>
          </div>
          <button type="button" onClick={() => setShowAppointment(true)}>Ver detalhes da consulta <PatientIcon name="arrow" /></button>
        </article> : <article className="next-appointment-card"><h2>Nenhuma consulta agendada</h2></article>}
      </section>

      {showAppointment && patientData.appointment ? (
        <div className="appointment-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowAppointment(false)}>
          <section ref={appointmentDialog} className="appointment-modal" role="dialog" aria-modal="true" aria-labelledby="appointment-modal-title">
            <header className="meal-modal-header">
              <div>
                <span className="card-label">Próxima consulta</span>
                <h2 id="appointment-modal-title">{patientData.appointment.type}</h2>
              </div>
              <button className="meal-modal-close" type="button" onClick={() => setShowAppointment(false)} aria-label="Fechar detalhes da consulta">×</button>
            </header>
            <div className="appointment-modal-highlight">
              <PatientIcon name="calendar" />
              <div><strong>{patientData.appointment.date}</strong><span>às {patientData.appointment.time}</span></div>
            </div>
            <dl className="appointment-details">
              <div><dt>Profissional</dt><dd>{patientData.nutritionist}</dd></div>
              <div><dt>Formato</dt><dd>{patientData.appointment.format}</dd></div>
              <div><dt>Local</dt><dd>{patientData.appointment.location}<small>{patientData.appointment.address}</small></dd></div>
            </dl>
            <p className="appointment-guidance">{patientData.appointment.guidance}</p>
            <button className="appointment-modal-done" type="button" onClick={() => setShowAppointment(false)}>Entendi</button>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function getNextMeal(meals: ReturnType<typeof usePatientData>["view"]["meals"]) {
  if (!meals.length) return null;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const meal = meals.find(({ time }) => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes >= currentMinutes;
  });
  return meal ? { ...meal, isTomorrow: false } : { ...meals[0], isTomorrow: true };
}

function Summary({ icon, label, value, detail }: { icon: IconName; label: string; value: string; detail: string }) {
  return (
    <article className="summary-card">
      <span className="summary-icon"><PatientIcon name={icon} /></span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <p>{detail}</p>
      </div>
    </article>
  );
}
