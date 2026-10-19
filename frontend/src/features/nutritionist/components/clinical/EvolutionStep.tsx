import { ErrorToast } from "../../../../components/ui/ErrorToast";
import { TablePagination } from "../../../../components/shared/TablePagination";
import { EvolutionChart } from "../../../care/EvolutionChart";
import { dateLabel, today } from "../../../../lib/formatters";
import { useMeasurements } from "../../hooks/useMeasurements";
import { useWeightGoal } from "../../hooks/useWeightGoal";
import { AutoSaveStatus } from "./AutoSaveStatus";
import { HistoryStatus } from "./HistoryStatus";

export function EvolutionStep({
  token,
  patientId,
}: {
  token: string;
  patientId: string;
}) {
  const measurement = useMeasurements(token, patientId);
  const {
    history,
    chartMeasurements,
    date,
    setDate,
    weight,
    setWeight,
    bodyFat,
    setBodyFat,
    note: measurementNote,
    setNote: setMeasurementNote,
    save: measurementSave,
  } = measurement;
  const {
    items: measurements,
    total: measurementTotal,
    page: measurementPage,
    changePage: setMeasurementPage,
  } = history;
  const weightGoal = useWeightGoal(token, patientId);
  const { goal, value: goalValue, save: goalSave } = weightGoal;
  return (
    <section className="nutri-card">
      <h2>Evolução</h2>
      <ErrorToast message={weightGoal.error} />
      {weightGoal.error && (
        <button type="button" onClick={weightGoal.reload}>
          Tentar carregar meta novamente
        </button>
      )}
      <ErrorToast message={measurement.chartError} />
      {measurement.chartError && (
        <button
          type="button"
          onClick={() => {
            void measurement.refreshChart();
          }}
        >
          Atualizar gráfico
        </button>
      )}
      <form
        className="nutri-form"
        onSubmit={(event) => {
          event.preventDefault();
          void goalSave.flush();
        }}
        onBlur={() => {
          void goalSave.flush();
        }}
      >
        <h3>Meta de peso</h3>
        <label>
          Meta (kg)
          <input
            type="number"
            min="0.1"
            max="500"
            step="0.1"
            required
            disabled={!goal}
            value={goalValue}
            onChange={(event) => {
              weightGoal.change(event.target.value);
            }}
          />
        </label>
        {goal?.author_name && <p>Última definição por {goal.author_name}.</p>}
        <AutoSaveStatus state={goalSave} />
      </form>
      <EvolutionChart measurements={chartMeasurements} />
      <form
        className="nutri-form"
        onSubmit={(event) => {
          event.preventDefault();
          void measurementSave.flush();
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            void measurementSave.flush();
        }}
      >
        <h3>Registrar medição</h3>
        <div className="nutri-form-grid">
          <label>
            Data
            <input
              type="date"
              required
              max={today()}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <label>
            Peso (kg)
            <input
              type="number"
              min="0.1"
              max="500"
              step="0.1"
              required
              value={weight}
              onChange={(event) => setWeight(event.target.value)}
            />
          </label>
          <label>
            Gordura corporal (%)
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={bodyFat}
              onChange={(event) => setBodyFat(event.target.value)}
            />
          </label>
          <label>
            Observação
            <input
              maxLength={2000}
              value={measurementNote}
              onChange={(event) => setMeasurementNote(event.target.value)}
            />
          </label>
        </div>
        <AutoSaveStatus state={measurementSave} />
        {measurementSave.status === "saved" && (
          <button
            type="button"
            onClick={() => {
              measurement.startNew();
            }}
          >
            Nova medição
          </button>
        )}
      </form>
      <HistoryStatus
        loading={history.loading}
        error={history.error}
        onRetry={history.refresh}
      />
      <div className="nutri-table-card">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Peso</th>
              <th>Gordura</th>
              <th>Observação / autor</th>
            </tr>
          </thead>
          <tbody>
            {measurements.map((row) => (
              <tr key={row.id}>
                <td data-label="Data">{dateLabel(row.measured_on)}</td>
                <td data-label="Peso">
                  {row.weight_kg.toLocaleString("pt-BR")} kg
                </td>
                <td data-label="Gordura">
                  {row.body_fat_pct === null
                    ? "—"
                    : `${row.body_fat_pct.toLocaleString("pt-BR")}%`}
                </td>
                <td data-label="Registro">
                  {row.note || "—"}
                  <small>{row.author_name}</small>
                </td>
              </tr>
            ))}
            {!history.loading && !history.error && !measurementTotal && (
              <tr>
                <td colSpan={4} className="nutri-empty">
                  Nenhuma medição registrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <TablePagination
          page={measurementPage}
          totalPages={history.totalPages}
          onPageChange={setMeasurementPage}
        />
      </div>
    </section>
  );
}
