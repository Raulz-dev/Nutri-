import { useState, type FormEvent } from "react";
import { useAuth } from "../../auth/useAuth";
import { useDemo, today, dateLabel } from "../../demo/store";
import { saveMeasurement } from "../../demo/actions";
import { EvolutionChart } from "../../demo/EvolutionChart";
import { TablePagination } from "../../../components/shared/TablePagination";
import { usePagination } from "../../../hooks/usePagination";
export function PatientEvolution({ patientId }: { patientId: string }) {
  const state = useDemo();
  const measurements = state.measurements
    .filter((m) => m.patientId === patientId)
    .sort((a, b) => a.date.localeCompare(b.date));
  const pagination = usePagination([...measurements].reverse(), patientId);
  return (
    <>
      <EvolutionChart measurements={measurements} />
      <MeasurementForm patientId={patientId} />
      <section className="nutri-card nutri-table-card">
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
            {pagination.items.map((m) => (
              <tr key={m.id}>
                <td data-label="Data">{dateLabel(m.date)}</td>
                <td data-label="Peso">{m.weight} kg</td>
                <td data-label="Gordura">
                  {m.bodyFat === null ? "—" : `${m.bodyFat}%`}
                </td>
                <td data-label="Registro">
                  {m.note || "—"}
                  <small>{m.authorName}</small>
                </td>
              </tr>
            ))}
            {!measurements.length && (
              <tr>
                <td colSpan={4} className="nutri-empty">
                  Nenhuma medição registrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <TablePagination {...pagination} />
      </section>
    </>
  );
}
function MeasurementForm({ patientId }: { patientId: string }) {
  const { currentUser } = useAuth();
  const state = useDemo();
  const [date, setDate] = useState(today());
  const [weight, setWeight] = useState("");
  const [fat, setFat] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    try {
      saveMeasurement(
        {
          id: crypto.randomUUID(),
          patientId,
          authorId: currentUser!.id,
          authorName:
            state.profiles[currentUser!.id]?.name || currentUser!.name,
          date,
          weight: Number(weight),
          bodyFat: fat === "" ? null : Number(fat),
          note,
        },
        currentUser!,
      );
      setWeight("");
      setFat("");
      setNote("");
      setMessage("Medição registrada.");
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  return (
    <section className="nutri-card">
      <h2>Registrar medição</h2>
      <form className="nutri-form" onSubmit={submit}>
        <div className="nutri-form-grid">
          <label>
            Data
            <input
              required
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label>
            Peso (kg)
            <input
              required
              type="number"
              min="0.1"
              max="500"
              step="0.1"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </label>
          <label>
            Gordura corporal (%)
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={fat}
              onChange={(e) => setFat(e.target.value)}
            />
          </label>
          <label>
            Observação
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
        <button className="nutri-primary">Salvar medição</button>
        {message && <p role="status">{message}</p>}
      </form>
    </section>
  );
}
