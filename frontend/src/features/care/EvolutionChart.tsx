import { useId, useState } from "react";
import type { Measurement } from "./types";
export function EvolutionChart({
  measurements,
}: {
  measurements: Measurement[];
}) {
  const [metric, setMetric] = useState<"weight" | "bodyFat">("weight");
  const id = useId();
  const rows = measurements.filter((m) => m[metric] !== null).slice(-8);
  const values = rows.map((m) => m[metric]!);
  const min = Math.min(...values),
    max = Math.max(...values);
  const points = values.map(
    (v, i) =>
      `${20 + i * (300 / Math.max(values.length - 1, 1))},${140 - ((v - min) / Math.max(max - min, 1)) * 110}`,
  );
  return (
    <section className="evolution-chart-card">
      <header className="evolution-chart-header">
        <h2>Evolução corporal</h2>
        <div className="chart-toggle">
          <button
            type="button"
            aria-pressed={metric === "weight"}
            className={metric === "weight" ? "is-active" : ""}
            onClick={() => setMetric("weight")}
          >
            Peso
          </button>
          <button
            type="button"
            aria-pressed={metric === "bodyFat"}
            className={metric === "bodyFat" ? "is-active" : ""}
            onClick={() => setMetric("bodyFat")}
          >
            Gordura
          </button>
        </div>
      </header>
      {rows.length ? (
        <>
          <svg
            className="nutri-evolution-svg"
            viewBox="0 0 340 170"
            role="img"
            aria-labelledby={id}
          >
            <title id={id}>
              Últimas medições de{" "}
              {metric === "weight" ? "peso" : "gordura corporal"}
            </title>
            <path d="M20 30H320M20 85H320M20 140H320" stroke="#eee8f5" />
            <polyline
              points={points.join(" ")}
              fill="none"
              stroke="#7542ce"
              strokeWidth="3"
            />
            {points.map((p, i) => (
              <circle
                key={rows[i].id}
                cx={p.split(",")[0]}
                cy={p.split(",")[1]}
                r="4"
                fill="#7542ce"
              />
            ))}
          </svg>
          <div className="nutri-chart-values">
            {rows.map((m) => (
              <span key={m.id}>
                <strong>
                  {m[metric]?.toLocaleString("pt-BR")}
                  {metric === "weight" ? " kg" : "%"}
                </strong>
                <small>
                  {new Date(m.date + "T12:00:00").toLocaleDateString("pt-BR")}
                </small>
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="nutri-empty">
          Nenhuma medição registrada para esta métrica.
        </p>
      )}
    </section>
  );
}
