import { usePatientData } from "../../demo/PatientContext";
import { dateLabel } from "../../demo/store";
import { EvolutionChart } from "../../demo/EvolutionChart";
import { TablePagination } from "../../../components/shared/TablePagination";
import { usePagination } from "../../../hooks/usePagination";
export function ProgressSection() {
  const { state, history, patientId, view } = usePatientData();
  const pagination = usePagination([...history].reverse(), patientId);
  const target = state.weightGoals?.[patientId];
  const initial = history[0]?.weight;
  const current = history.at(-1)?.weight;
  const progress =
    target !== undefined && initial !== undefined && current !== undefined
      ? target === initial
        ? 100
        : Math.max(
            0,
            Math.min(
              100,
              Math.round(((current - initial) / (target - initial)) * 100),
            ),
          )
      : null;
  return (
    <div className="progress-page">
      <section className="progress-main-grid">
        <EvolutionChart measurements={history} />
        <article className="goal-progress-card">
          <span className="card-label">Objetivo atual</span>
          <h2>Meta de peso</h2>
          {progress !== null ? (
            <div
              className="goal-progress-ring"
              style={{
                background: `conic-gradient(#ffffff ${progress * 3.6}deg, rgb(255 255 255 / 16%) 0)`,
              }}
            >
              <div>
                <strong>{progress}%</strong>
                <small>concluído</small>
              </div>
            </div>
          ) : (
            <p>Meta de peso ainda não informada.</p>
          )}
          <dl>
            <div>
              <dt>Inicial</dt>
              <dd>
                {initial !== undefined
                  ? `${initial.toLocaleString("pt-BR")} kg`
                  : "Sem registro"}
              </dd>
            </div>
            <div>
              <dt>Atual</dt>
              <dd>{view.currentWeight}</dd>
            </div>
            <div>
              <dt>Meta</dt>
              <dd>
                {target !== undefined
                  ? `${target.toLocaleString("pt-BR")} kg`
                  : "—"}
              </dd>
            </div>
          </dl>
        </article>
      </section>
      <section className="measurement-history">
        <header>
          <h2>Histórico de medições</h2>
          <span>Peso atual: {view.currentWeight}</span>
        </header>
        <div className="measurement-list">
          {pagination.items.map((m) => (
            <article key={m.id}>
              <span>{dateLabel(m.date)}</span>
              <div>
                <small>Peso</small>
                <strong>{m.weight.toLocaleString("pt-BR")} kg</strong>
              </div>
              <div>
                <small>Gordura</small>
                <strong>
                  {m.bodyFat === null
                    ? "—"
                    : `${m.bodyFat.toLocaleString("pt-BR")}%`}
                </strong>
              </div>
              <span>{m.note}</span>
            </article>
          ))}
          {!history.length && (
            <p className="nutri-empty">Nenhuma medição registrada.</p>
          )}
        </div>
        <TablePagination {...pagination} />
      </section>
    </div>
  );
}
