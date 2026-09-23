import { useState } from "react";

import { PatientIcon } from "../components/PatientIcon";
import { patientMock } from "../mocks/patient-data";

type Metric = "weight" | "bodyFat";

export function ProgressSection() {
  const [metric, setMetric] = useState<Metric>("weight");
  const [showAllMeasurements, setShowAllMeasurements] = useState(false);
  const visibleMeasurements = showAllMeasurements
    ? patientMock.measurementHistory
    : patientMock.measurementHistory.slice(-4);
  const chartValues = patientMock.measurements.map((measurement) => measurement[metric]);
  const chartMax = Math.max(...chartValues);
  const chartMin = Math.min(...chartValues);
  const chartPoints = chartValues.map((value, index) => ({
    x: 20 + index * 100,
    y: 142 - ((value - chartMin) / Math.max(chartMax - chartMin, 1)) * 96,
  }));
  const linePoints = chartPoints.map(({ x, y }) => `${x},${y}`).join(" ");
  const areaPoints = `20,154 ${linePoints} 320,154`;
  const metricLabel = metric === "weight" ? "peso" : "gordura corporal";

  return (
    <div className="progress-page">
      <section className="progress-main-grid">
        <article className="progress-chart-card">
          <header className="progress-card-header">
            <div>
              <span className="card-label">Últimas quatro semanas</span>
              <h2>Evolução corporal</h2>
              <p>Acompanhe as mudanças registradas em cada medição.</p>
            </div>
            <div className="progress-chart-actions">
              <div className="chart-toggle" aria-label="Métrica do gráfico">
                <button className={metric === "weight" ? "is-active" : ""} type="button" onClick={() => setMetric("weight")} aria-pressed={metric === "weight"}>Peso</button>
                <button className={metric === "bodyFat" ? "is-active" : ""} type="button" onClick={() => setMetric("bodyFat")} aria-pressed={metric === "bodyFat"}>Gordura</button>
              </div>
              <button
                className="measurements-toggle"
                type="button"
                aria-expanded={showAllMeasurements}
                aria-controls="measurement-history-list"
                onClick={() => setShowAllMeasurements((current) => !current)}
              >
                {showAllMeasurements ? "Mostrar recentes" : "Ver todas as medições"}
                <PatientIcon name="arrow" />
              </button>
            </div>
          </header>

          <div className="progress-line-chart" role="img" aria-label={`Gráfico da evolução de ${metricLabel}`}>
            <svg viewBox="0 0 340 175" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="progress-area-gradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#7542ce" stopOpacity=".25" />
                  <stop offset="100%" stopColor="#7542ce" stopOpacity="0" />
                </linearGradient>
              </defs>
              <line className="progress-grid-line" x1="0" x2="340" y1="48" y2="48" />
              <line className="progress-grid-line" x1="0" x2="340" y1="96" y2="96" />
              <line className="progress-grid-line" x1="0" x2="340" y1="144" y2="144" />
              <polygon className="progress-chart-area" points={areaPoints} />
              <polyline className="progress-chart-line" points={linePoints} />
              {chartPoints.map(({ x, y }, index) => (
                <g key={patientMock.measurements[index].date}>
                  <circle className="progress-chart-halo" cx={x} cy={y} r="8" />
                  <circle className="progress-chart-point" cx={x} cy={y} r="4" />
                </g>
              ))}
            </svg>
            <div className="progress-chart-values">
              {patientMock.measurements.map((measurement) => (
                <span key={measurement.date}>
                  <strong>{formatValue(measurement[metric])}{metric === "weight" ? " kg" : "%"}</strong>
                  <small>{measurement.date}</small>
                </span>
              ))}
            </div>
          </div>

        </article>

        <article className="goal-progress-card">
          <span className="card-label">Objetivo atual</span>
          <h2>Meta de peso</h2>
          <div className="goal-progress-ring" style={{ background: `conic-gradient(#ffffff ${patientMock.goalProgress * 3.6}deg, rgb(255 255 255 / 16%) 0)` }}>
            <div>
              <strong>{patientMock.goalProgress}%</strong>
              <small>concluído</small>
            </div>
          </div>
          <p>{patientMock.goalDetail}.</p>
          <dl>
            <div><dt>Inicial</dt><dd>{formatValue(patientMock.measurements[0].weight)} kg</dd></div>
            <div><dt>Atual</dt><dd>{patientMock.currentWeight}</dd></div>
            <div><dt>Meta</dt><dd>{patientMock.goal}</dd></div>
          </dl>
        </article>
      </section>

      <section className="measurement-history" aria-labelledby="measurement-history-title">
        <header>
          <div>
            <span className="card-label">Histórico</span>
            <h2 id="measurement-history-title">Medições recentes</h2>
          </div>
          <span className="measurement-period">{visibleMeasurements.length} registros</span>
        </header>
        <div className="measurement-list" id="measurement-history-list">
          {[...visibleMeasurements].reverse().map((measurement) => {
            const originalIndex = patientMock.measurementHistory.findIndex((item) => item.date === measurement.date);
            const previous = patientMock.measurementHistory[originalIndex - 1];
            const change = previous ? measurement.weight - previous.weight : null;

            return (
              <article key={measurement.date}>
                <span className="measurement-date"><strong>{measurement.date.split(" ")[0]}</strong><small>{measurement.date.split(" ")[1]}</small></span>
                <div><small>Peso</small><strong>{formatValue(measurement.weight)} kg</strong></div>
                <div><small>Gordura</small><strong>{formatValue(measurement.bodyFat)}%</strong></div>
                <span className={change === null ? "measurement-change is-neutral" : "measurement-change"}>
                  {change === null ? "Início" : `${formatSignedValue(change)} kg`}
                </span>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function formatValue(value: number) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function formatSignedValue(value: number) {
  const formatted = formatValue(Math.abs(value));
  return `${value > 0 ? "+" : "−"}${formatted}`;
}
