import { useState } from "react";

import { PatientIcon, type IconName } from "../components/PatientIcon";
import { patientMock, type PatientSection } from "../mocks/patient-data";

export function HomeSection({ onNavigate }: { onNavigate: (section: PatientSection) => void }) {
  const [chartMetric, setChartMetric] = useState<"weight" | "bodyFat">("weight");
  const nextMeal = getNextMeal();
  const chartValues = patientMock.measurements.map((measurement) => measurement[chartMetric]);
  const chartMax = Math.max(...chartValues);
  const chartMin = Math.min(...chartValues);
  const chartPoints = chartValues.map((value, index) => ({
    x: 18 + index * 101,
    y: 138 - ((value - chartMin) / Math.max(chartMax - chartMin, 1)) * 92,
  }));
  const linePoints = chartPoints.map(({ x, y }) => `${x},${y}`).join(" ");
  const areaPoints = `18,150 ${linePoints} 321,150`;

  return (
    <div className="home-dashboard">
      <section className="health-summary-grid" aria-label="Resumo de saúde">
        <Summary icon="chart" label="Peso atual" value={patientMock.currentWeight} detail={`${patientMock.weightChange} desde o início`} />
        <Summary icon="percent" label="Percentual de gordura" value={patientMock.bodyFat} detail={patientMock.bodyFatChange} />
        <Summary icon="clock" label="Próxima refeição" value={nextMeal.title} detail={`${nextMeal.time}${nextMeal.isTomorrow ? " · amanhã" : ""}`} />
        <Summary icon="water" label="Água diária" value={patientMock.mealPlan.dailyWaterGoal} detail="Meta diária do plano" />
        <Summary icon="target" label="Calorias diárias" value={patientMock.dailyCalories} detail="Total estimado do plano" />
      </section>

      <section className="dashboard-insights">
        <article className="evolution-chart-card">
          <header className="evolution-chart-header">
            <div>
              <span className="card-label">Sua evolução</span>
              <h2>{chartMetric === "weight" ? "Peso" : "Gordura corporal"}</h2>
              <p>Últimas quatro medições</p>
            </div>
            <div className="chart-toggle" aria-label="Métrica do gráfico">
              <button className={chartMetric === "weight" ? "is-active" : ""} type="button" onClick={() => setChartMetric("weight")} aria-pressed={chartMetric === "weight"}>
                Peso
              </button>
              <button className={chartMetric === "bodyFat" ? "is-active" : ""} type="button" onClick={() => setChartMetric("bodyFat")} aria-pressed={chartMetric === "bodyFat"}>
                Gordura
              </button>
            </div>
          </header>
          <div className="line-chart" role="img" aria-label={`Gráfico de linha da evolução de ${chartMetric === "weight" ? "peso" : "gordura corporal"}`}>
            <svg viewBox="0 0 340 170" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="chart-area-gradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#7542ce" stopOpacity=".28" />
                  <stop offset="100%" stopColor="#7542ce" stopOpacity="0" />
                </linearGradient>
              </defs>
              <line className="chart-grid-line" x1="0" x2="340" y1="46" y2="46" />
              <line className="chart-grid-line" x1="0" x2="340" y1="92" y2="92" />
              <line className="chart-grid-line" x1="0" x2="340" y1="138" y2="138" />
              <polygon className="chart-area" points={areaPoints} />
              <polyline className="chart-line" points={linePoints} />
              {chartPoints.map(({ x, y }, index) => (
                <circle className="chart-point" cx={x} cy={y} r="5" key={patientMock.measurements[index].date} />
              ))}
            </svg>
            <div className="chart-values">
              {patientMock.measurements.map((measurement) => (
                <span key={measurement.date}>
                  <strong>
                    {String(measurement[chartMetric]).replace(".", ",")}
                    {chartMetric === "weight" ? " kg" : "%"}
                  </strong>
                  <small>{measurement.date}</small>
                </span>
              ))}
            </div>
          </div>
          <button className="chart-details-button" type="button" onClick={() => onNavigate("progress")}>
            Ver detalhes <PatientIcon name="arrow" />
          </button>
        </article>

        <article className="next-appointment-card">
          <div className="appointment-icon"><PatientIcon name="calendar" /></div>
          <span className="appointment-eyebrow">Próxima consulta</span>
          <h2>28 de setembro</h2>
          <strong>14h30</strong>
          <div className="appointment-professional">
            <span>MC</span>
            <div>
              <strong>{patientMock.nutritionist}</strong>
              <small>Consulta de acompanhamento</small>
            </div>
          </div>
          <button type="button">Ver detalhes da consulta <PatientIcon name="arrow" /></button>
        </article>
      </section>
    </div>
  );
}

function getNextMeal() {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const meal = patientMock.meals.find(({ time }) => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes >= currentMinutes;
  });
  return meal ? { ...meal, isTomorrow: false } : { ...patientMock.meals[0], isTomorrow: true };
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
