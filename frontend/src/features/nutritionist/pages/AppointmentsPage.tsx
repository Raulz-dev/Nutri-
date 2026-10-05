import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/useAuth";
import { dateLabel, demoUsers, useDemo } from "../../demo/store";
import { saveAppointment } from "../../demo/actions";
import type { Appointment } from "../../demo/types";
import { TablePagination } from "../../../components/shared/TablePagination";
import { usePagination } from "../../../hooks/usePagination";
import { AppointmentForm } from "../components/AppointmentForm";
const statuses = {
  scheduled: "Agendada",
  completed: "Realizada",
  cancelled: "Cancelada",
};
export function NutritionistAppointmentsPage() {
  const { currentUser } = useAuth();
  const state = useDemo();
  const [params] = useSearchParams();
  const [patientId, setPatient] = useState(params.get("paciente") ?? "");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState<Appointment | "new" | null>(null);
  const [error, setError] = useState("");
  const patients = demoUsers(state).filter((p) =>
    state.links.some(
      (l) => l.patientId === p.id && l.nutritionistId === currentUser!.id,
    ),
  );
  const rows = state.appointments
    .filter(
      (a) =>
        a.authorId === currentUser!.id &&
        patients.some((p) => p.id === a.patientId) &&
        (!patientId || a.patientId === patientId) &&
        (!date || a.date === date) &&
        (status === "all" || a.status === status),
    )
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const pagination = usePagination(
    rows,
    JSON.stringify([patientId, date, status]),
  );
  function change(a: Appointment, status: Appointment["status"]) {
    try {
      saveAppointment({ ...a, status }, currentUser!);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <header className="nutri-heading">
        <span>AGENDA</span>
        <h1>Consultas</h1>
        <p>Prepare os próximos encontros e acompanhe os atendimentos.</p>
      </header>
      <div className="nutri-toolbar nutri-appointment-filters">
        <label>
          <span className="nutri-filter-label">Paciente</span>
          <select
            value={patientId}
            onChange={(e) => setPatient(e.target.value)}
          >
            <option value="">Todos os pacientes</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="nutri-filter-label">Data da consulta</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          <span className="nutri-filter-label">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Todos</option>
            {Object.entries(statuses).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="nutri-primary"
          disabled={!patients.length}
          onClick={() => setEditing("new")}
        >
          Agendar consulta
        </button>
      </div>
      {error && (
        <p role="alert" className="nutri-error">
          {error}
        </p>
      )}
      <section className="nutri-card nutri-table-card">
        <table>
          <thead>
            <tr>
              <th>Paciente</th>
              <th>Data e horário</th>
              <th>Modalidade</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {pagination.items.map((a) => (
              <tr key={a.id}>
                <td data-label="Paciente">
                  {patients.find((p) => p.id === a.patientId)?.name}
                </td>
                <td data-label="Data">
                  {dateLabel(a.date)} · {a.time}
                </td>
                <td data-label="Modalidade">{a.format}</td>
                <td data-label="Status">{statuses[a.status]}</td>
                <td>
                  <div className="nutri-actions">
                    <button onClick={() => setEditing(a)}>
                      Detalhes / editar
                    </button>
                    {a.status === "scheduled" && (
                      <>
                        <button onClick={() => change(a, "completed")}>
                          Realizada
                        </button>
                        <button onClick={() => change(a, "cancelled")}>
                          Cancelar
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5} className="nutri-empty">
                  Nenhuma consulta encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <TablePagination {...pagination} />
      </section>
      {editing && (
        <AppointmentForm
          source={editing === "new" ? undefined : editing}
          defaultPatient={patientId || patients[0]?.id || ""}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
