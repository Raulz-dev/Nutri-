import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/useAuth";
import { listPatients, type PatientRow } from "../../care/api";
import { changeAppointmentStatus, listAppointments, type AppointmentRecord } from "../../care/interaction-api";
import { dateLabel } from "../../../lib/formatters";
import { TablePagination } from "../../../components/shared/TablePagination";
import { ErrorToast } from "../../../components/ui/ErrorToast";
import { TableActionIcon } from "../../../components/shared/TableActionIcon";
import { AppointmentForm } from "../components/AppointmentForm";

const statuses = { scheduled: "Agendada", completed: "Realizada", cancelled: "Cancelada" };

export function NutritionistAppointmentsPage() {
  const { session } = useAuth();
  const token = session?.accessToken ?? "";
  const [params] = useSearchParams();
  const [patientId, setPatient] = useState(params.get("paciente") ?? "");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [rows, setRows] = useState<AppointmentRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [editing, setEditing] = useState<AppointmentRecord | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");

  const fetchAppointments = useCallback(() => listAppointments(token, (page - 1) * 10, { patientId, date, status }), [token, page, patientId, date, status]);
  const refresh = useCallback(async () => {
    const result = await fetchAppointments();
    setRows(result.items);
    setTotal(result.total);
    setLoadError("");
  }, [fetchAppointments]);

  useEffect(() => {
    let active = true;
    async function loadPatients() {
      const all: PatientRow[] = [];
      for (let offset = 0;; offset += 10) {
        const result = await listPatients(token, offset);
        all.push(...result.items);
        if (all.length >= result.total || !result.items.length) break;
      }
      if (active) setPatients(all);
    }
    void loadPatients().catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Falha ao carregar pacientes."); });
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    setRows([]);
    setTotal(0);
    void fetchAppointments().then(result => {
      if (active) { setRows(result.items); setTotal(result.total); }
    }).catch(reason => { if (active) setLoadError(reason instanceof Error ? reason.message : "Falha ao carregar consultas."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fetchAppointments]);

  async function change(row: AppointmentRecord, nextStatus: "completed" | "cancelled") {
    setBusy(true);
    setError("");
    try {
      await changeAppointmentStatus(token, row, nextStatus);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível alterar a consulta.");
    } finally { setBusy(false); }
  }

  function saved() {
    setEditing(null);
    setPage(1);
    if (page === 1) void refresh().catch(reason => setError(reason instanceof Error ? reason.message : "Consulta salva, mas a lista não foi atualizada."));
  }

  return <>
    <header className="nutri-heading"><span>AGENDA</span><h1>Consultas</h1><p>Prepare os próximos encontros e acompanhe os atendimentos.</p></header>
    <div className="nutri-toolbar nutri-appointment-filters">
      <label><span className="nutri-filter-label">Paciente</span><select value={patientId} onChange={event => { setPatient(event.target.value); setPage(1); }}>
        <option value="">Todos os pacientes</option>{patients.map(patient => <option key={patient.id} value={patient.id}>{patient.name}</option>)}
      </select></label>
      <label><span className="nutri-filter-label">Data da consulta</span><input type="date" value={date} onChange={event => { setDate(event.target.value); setPage(1); }} /></label>
      <label><span className="nutri-filter-label">Status</span><select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
        <option value="all">Todos</option>{Object.entries(statuses).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select></label>
      <button className="nutri-primary" disabled={!patients.length} onClick={() => setEditing("new")}>Agendar consulta</button>
    </div>
    <ErrorToast message={loadError || error} />
    <section className="nutri-card nutri-table-card"><table><thead><tr><th>Paciente</th><th>Data e horário</th><th>Modalidade</th><th>Status</th><th>Ações</th></tr></thead><tbody>
      {rows.map(row => <tr key={row.id}>
        <td data-label="Paciente">{row.patientName}</td>
        <td data-label="Data">{dateLabel(row.date)} · {row.time}</td>
        <td data-label="Modalidade">{row.format}</td>
        <td data-label="Status">{statuses[row.status]}</td>
        <td data-label="Ações"><div className="nutri-actions nutri-appointment-actions">
          <button type="button" className="nutri-table-action" aria-label={row.status === "scheduled" ? "Ver detalhes ou editar consulta" : "Ver detalhes da consulta"} data-tooltip={row.status === "scheduled" ? "Ver detalhes ou editar consulta" : "Ver detalhes da consulta"} onClick={() => setEditing(row)}><TableActionIcon name={row.status === "scheduled" ? "edit" : "view"} /></button>
          {row.status === "scheduled" && <>
            <button type="button" className="nutri-table-action" aria-label="Marcar consulta como realizada" data-tooltip="Marcar consulta como realizada" disabled={busy} onClick={() => { void change(row, "completed"); }}><TableActionIcon name="check" /></button>
            <button type="button" className="nutri-table-action danger" aria-label="Cancelar consulta" data-tooltip="Cancelar consulta" disabled={busy} onClick={() => { void change(row, "cancelled"); }}><TableActionIcon name="cancel" /></button>
          </>}
        </div></td>
      </tr>)}
      {!rows.length && !loading && !loadError && <tr><td colSpan={5} className="nutri-empty">Nenhuma consulta encontrada.</td></tr>}
      {loadError && !loading && <tr><td colSpan={5} className="nutri-empty">Não foi possível carregar as consultas. <button type="button" className="nutri-table-action" aria-label="Tentar carregar consultas novamente" data-tooltip="Tentar carregar consultas novamente" onClick={() => { setLoading(true); void refresh().catch(reason => setLoadError(reason instanceof Error ? reason.message : "Falha ao carregar consultas.")).finally(() => setLoading(false)); }}><TableActionIcon name="retry" /></button></td></tr>}
      {loading && <tr><td colSpan={5} className="nutri-empty">Carregando consultas...</td></tr>}
    </tbody></table><TablePagination page={page} totalPages={Math.max(1, Math.ceil(total / 10))} onPageChange={setPage} /></section>
    {editing && <AppointmentForm source={editing === "new" ? undefined : editing} defaultPatient={patientId || patients[0]?.id || ""} patients={patients} onClose={() => setEditing(null)} onSaved={saved} />}
  </>;
}
