import { ErrorToast } from "../../../../components/ui/ErrorToast";
import { EvolutionChart } from "../../../care/EvolutionChart";
import { today } from "../../../../lib/formatters";
import { useMeasurements } from "../../hooks/useMeasurements";
import { useWeightGoal } from "../../hooks/useWeightGoal";
import { AutoSaveStatus } from "./AutoSaveStatus";
import { MeasurementHistory } from "./MeasurementHistory";

export function EvolutionStep({
  token,
  patientId,
}: {
  token: string;
  patientId: string;
}) {
  const measurement = useMeasurements(token, patientId);
  const weightGoal = useWeightGoal(token, patientId);
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
          void weightGoal.save.flush();
        }}
        onBlur={() => {
          void weightGoal.save.flush();
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
            disabled={!weightGoal.goal}
            value={weightGoal.value}
            onChange={(event) => {
              weightGoal.change(event.target.value);
            }}
          />
        </label>
        {weightGoal.goal?.author_name && (
          <p>Última definição por {weightGoal.goal.author_name}.</p>
        )}
        <AutoSaveStatus state={weightGoal.save} />
      </form>
      <EvolutionChart measurements={measurement.chartMeasurements} />
      <form
        className="nutri-form"
        onSubmit={(event) => {
          event.preventDefault();
          void measurement.save.flush();
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            void measurement.save.flush();
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
              value={measurement.date}
              onChange={(event) => measurement.setDate(event.target.value)}
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
              value={measurement.weight}
              onChange={(event) => measurement.setWeight(event.target.value)}
            />
          </label>
          <label>
            Gordura corporal (%)
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={measurement.bodyFat}
              onChange={(event) => measurement.setBodyFat(event.target.value)}
            />
          </label>
          <label>
            Observação
            <input
              maxLength={2000}
              value={measurement.note}
              onChange={(event) => measurement.setNote(event.target.value)}
            />
          </label>
        </div>
        <AutoSaveStatus state={measurement.save} />
        {measurement.save.status === "saved" && (
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
      <MeasurementHistory history={measurement.history} />
    </section>
  );
}
