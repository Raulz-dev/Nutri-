import { useEffect, useState } from "react";
import { useAuth } from "../../auth/useAuth";
import { usePatientClinical } from "../../care/PatientClinicalContext";
import { listMeasurements, type ClinicalMeasurement } from "../../care/clinical-api";
import { usePatientData } from "../../demo/PatientContext";
import { dateLabel } from "../../demo/store";
import { EvolutionChart } from "../../demo/EvolutionChart";
import { TablePagination } from "../../../components/shared/TablePagination";
import { ErrorToast } from "../../../components/ui/ErrorToast";
export function ProgressSection() {
  const { history, patientId, view } = usePatientData();
  const { session } = useAuth();
  const clinical = usePatientClinical();
  const token = session?.accessToken ?? "";
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ClinicalMeasurement[]>([]);
  const [loadedPage, setLoadedPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setLoadedPage(0);
    setRows([]);
    listMeasurements(token, patientId, (page - 1) * 10).then(result => {
      if (!active) return;
      setRows(result.items);
      setTotal(result.total);
      setLoadedPage(page);
    }).catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : "Falha ao carregar as medições.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, patientId, page]);
  const initial = clinical.firstMeasurement?.weight;
  const current = history.at(-1)?.weight;
  const target = clinical.weightGoal?.target_kg ?? undefined;
  const progress = target !== undefined && initial !== undefined && current !== undefined
    ? target === initial
      ? current === target ? 100 : 0
      : Math.max(0, Math.min(100, Math.round(((current - initial) / (target - initial)) * 100)))
    : null;
  return (
    <div className="progress-page">
      <ErrorToast message={error} />
      <section className="progress-main-grid">
        <EvolutionChart measurements={history} />
        <article className="goal-progress-card">
          <span className="card-label">Objetivo atual</span>
          <h2>Meta de peso</h2>
          {progress === null ? <p>Meta de peso ainda não informada.</p> : (
            <div className="goal-progress-ring" style={{ background: `conic-gradient(#ffffff ${progress * 3.6}deg, rgb(255 255 255 / 16%) 0)` }}>
              <div><strong>{progress}%</strong><small>concluído</small></div>
            </div>
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
              <dd>{target === undefined ? "—" : `${target.toLocaleString("pt-BR")} kg`}</dd>
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
          {loadedPage === page && !loading && !error && rows.map((m) => (
            <article key={m.id}>
              <span>{dateLabel(m.measured_on)}</span>
              <div>
                <small>Peso</small>
                <strong>{m.weight_kg.toLocaleString("pt-BR")} kg</strong>
              </div>
              <div>
                <small>Gordura</small>
                <strong>
                  {m.body_fat_pct === null
                    ? "—"
                    : `${m.body_fat_pct.toLocaleString("pt-BR")}%`}
                </strong>
              </div>
              <span>{m.note}</span>
            </article>
          ))}
          {loading && <p className="nutri-empty">Carregando medições...</p>}
          {!loading && error && <p className="nutri-empty">Não foi possível carregar esta página de medições.</p>}
          {!loading && !total && !error && (
            <p className="nutri-empty">Nenhuma medição registrada.</p>
          )}
        </div>
        <TablePagination page={page} totalPages={Math.max(1, Math.ceil(total / 10))} onPageChange={setPage} />
      </section>
    </div>
  );
}
