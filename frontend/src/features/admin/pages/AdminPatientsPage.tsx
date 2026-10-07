import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/useAuth";
import { ErrorToast } from "../../../components/ui/ErrorToast";
import { assignPatient, deactivateUser, listAllUsers, listPatients, unassignPatient, updateUser, type PatientRow } from "../../care/api";
import type { User } from "../../users/types";
import { AdminIcon, AdminShell } from "../AdminShell";
import { AssignmentModal } from "../components/users/AssignmentModal";
import { ConfirmModal } from "../components/users/ConfirmModal";
import { TablePagination } from "../components/TablePagination";

export function AdminPatientsPage() {
  const { session } = useAuth();
  const token = session?.accessToken ?? "";
  const [params] = useSearchParams();
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [nutritionists, setNutritionists] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [error, setError] = useState("");
  const [modalError, setModalError] = useState("");
  const [notice, setNotice] = useState("");
  const [assigning, setAssigning] = useState<PatientRow | null>(null);
  const [deleting, setDeleting] = useState<PatientRow | null>(null);
  const [busy, setBusy] = useState(false);
  const assignmentTrigger = useRef<HTMLButtonElement | null>(null);

  const refresh = useCallback(async () => {
    const result = await listPatients(token, (page - 1) * 10, search, true);
    setPatients(result.items);
    setTotal(result.total);
  }, [token, page, search]);

  useEffect(() => {
    refresh().catch(reason => setError(reason instanceof Error ? reason.message : "Falha ao carregar pacientes."));
  }, [refresh]);
  useEffect(() => {
    listAllUsers(token)
      .then(users => setNutritionists(users.filter(user => user.role === "nutritionist" && user.status === "active" && !user.deactivated_at)))
      .catch(reason => setError(reason instanceof Error ? reason.message : "Falha ao carregar nutricionistas."));
  }, [token]);

  async function toggle(patient: PatientRow) {
    setBusy(true); setError(""); setNotice("");
    try {
      await updateUser(token, patient.id, { status: patient.status === "active" ? "blocked" : "active" });
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível alterar a conta.");
    } finally { setBusy(false); }
  }

  async function deactivate() {
    if (!deleting) return;
    setBusy(true); setModalError(""); setNotice("");
    try {
      await deactivateUser(token, deleting.id);
      setDeleting(null);
      await refresh();
    } catch (reason) {
      setModalError(reason instanceof Error ? reason.message : "Não foi possível desativar a conta.");
    } finally { setBusy(false); }
  }

  async function changeAssignment(nutritionistId?: string) {
    if (!assigning) return;
    setBusy(true); setModalError(""); setNotice("");
    try {
      if (nutritionistId) await assignPatient(token, assigning.id, nutritionistId);
      else await unassignPatient(token, assigning.id);
      setAssigning(null);
      setNotice(nutritionistId ? "Vínculo atualizado." : "Vínculo removido.");
      try { await refresh(); }
      catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível atualizar a lista de pacientes."); }
      requestAnimationFrame(() => assignmentTrigger.current?.focus());
    } catch (reason) {
      setModalError(reason instanceof Error ? reason.message : "Não foi possível alterar o vínculo.");
    } finally { setBusy(false); }
  }

  return <AdminShell title="Pacientes" subtitle="Gerencie o acesso e o nutricionista responsável por cada paciente.">
    <ErrorToast message={error} />
    {notice && <p className="admin-form-message" role="status">{notice}</p>}
    <section className="admin-panel users-search-panel"><div className="users-filters"><label className="admin-search"><span className="sr-only">Pesquisar pacientes</span><AdminIcon name="search"/><input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Nome ou e-mail" /></label></div></section>
    <section className="admin-panel users-table-panel"><div className="users-table-wrap"><table className="users-table patients-table"><thead><tr><th>Paciente</th><th>Nutricionista</th><th>Status</th><th>Ações</th></tr></thead><tbody>
      {patients.map(patient => <tr key={patient.id}>
        <td data-label="Paciente"><div className="user-cell"><span>{patient.name.split(" ").map(part => part[0]).slice(0, 2).join("")}</span><div><strong>{patient.name}</strong><small>{patient.email}</small></div></div></td>
        <td data-label="Nutricionista">{patient.nutritionist_name ?? "Sem vínculo"}</td>
        <td data-label="Status">{patient.deactivated_at ? "Desativado" : patient.status === "active" ? "Ativo" : "Bloqueado"}</td>
        <td data-label="Ações"><div className="row-actions">
          <button type="button" className="icon-action" disabled={busy || Boolean(patient.deactivated_at)} onClick={event => { assignmentTrigger.current = event.currentTarget; setAssigning(patient); setModalError(""); }} aria-label={`Alterar vínculo de ${patient.name}`} data-tooltip="Alterar vínculo"><AdminIcon name="link" /></button>
          <button type="button" className="icon-action" disabled={busy || Boolean(patient.deactivated_at)} onClick={() => toggle(patient)} aria-label={patient.status === "active" ? `Bloquear ${patient.name}` : `Ativar ${patient.name}`} data-tooltip="Alterar acesso"><AdminIcon name={patient.status === "active" ? "lock" : "unlock"} /></button>
          <button type="button" className="icon-action danger" disabled={busy || Boolean(patient.deactivated_at)} onClick={() => { setModalError(""); setDeleting(patient); }} aria-label={`Desativar ${patient.name}`} data-tooltip="Desativar paciente"><AdminIcon name="trash" /></button>
        </div></td>
      </tr>)}
      {!patients.length && <tr><td colSpan={4} className="users-empty">Nenhum paciente encontrado.</td></tr>}
    </tbody></table></div><TablePagination page={page} totalPages={Math.max(1, Math.ceil(total / 10))} onPageChange={setPage} /></section>
    {assigning && <AssignmentModal patient={assigning} nutritionists={nutritionists} busy={busy} error={modalError} onClose={() => setAssigning(null)} onSave={changeAssignment} onRemove={() => changeAssignment()} />}
    {deleting && <ConfirmModal user={deleting} busy={busy} error={modalError} onClose={() => setDeleting(null)} onConfirm={deactivate} />}
  </AdminShell>;
}
