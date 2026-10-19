import { TablePagination } from "../../../../components/shared/TablePagination";
import { useAssessments } from "../../hooks/useAssessments";
import { AutoSaveStatus } from "./AutoSaveStatus";
import { HistoryStatus } from "./HistoryStatus";

export function AssessmentStep({
  token,
  patientId,
}: {
  token: string;
  patientId: string;
}) {
  const {
    history,
    text: assessment,
    setText: setAssessment,
    save: assessmentSave,
    startNew,
  } = useAssessments(token, patientId);
  const {
    items: followUps,
    total: followUpTotal,
    page: assessmentPage,
    changePage: setAssessmentPage,
  } = history;
  return (
    <section className="nutri-card">
      <h2>Avaliações</h2>
      <form
        className="nutri-form"
        onSubmit={(event) => {
          event.preventDefault();
          void assessmentSave.flush();
        }}
        onBlur={() => {
          void assessmentSave.flush();
        }}
      >
        <label>
          Nova avaliação
          <textarea
            value={assessment}
            onChange={(event) => setAssessment(event.target.value)}
            required
            maxLength={4000}
          />
        </label>
        <AutoSaveStatus state={assessmentSave} />
        {assessmentSave.status === "saved" && (
          <button
            type="button"
            onClick={() => {
              startNew();
            }}
          >
            Nova avaliação
          </button>
        )}
      </form>
      <HistoryStatus
        loading={history.loading}
        error={history.error}
        onRetry={history.refresh}
      />
      {followUps.map((row) => (
        <article className="nutri-record" key={row.id}>
          <small>
            {new Date(row.created_at).toLocaleString("pt-BR")} ·{" "}
            {row.author_name}
          </small>
          <p>{row.text}</p>
        </article>
      ))}
      {!history.loading && !history.error && !followUpTotal && (
        <p className="nutri-empty">Nenhuma avaliação registrada.</p>
      )}
      <TablePagination
        page={assessmentPage}
        totalPages={history.totalPages}
        onPageChange={setAssessmentPage}
      />
    </section>
  );
}
