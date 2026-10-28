import { TableActionIcon } from "../../../components/shared/TableActionIcon";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { InvitePatientModal } from "../components/InvitePatientModal";
import { TablePagination } from "../../../components/shared/TablePagination";
import { ErrorToast, useSuccessToast } from "../../../components/ui/ErrorToast";
import { useAuth } from "../../auth/useAuth";
import { invitePatient, listPatients, type PatientRow } from "../../care/api";

const PAGE_SIZE = 5;

export function NutritionistPatientsPage() {
  const { session } = useAuth();
  const token = session?.accessToken ?? "";
  const [rows, setRows] = useState<PatientRow[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const showSuccess = useSuccessToast();
  const refresh = useCallback(async () => {
    const patients = await listPatients(token, (page - 1) * PAGE_SIZE, search, false, true, PAGE_SIZE);
    setRows(patients.items);
    setTotal(patients.total);
  }, [token, page, search]);

  useEffect(() => {
    refresh().catch((reason) => setError(reason instanceof Error ? reason.message : "Falha ao carregar pacientes."));
  }, [refresh]);

  async function sendInvitation(email: string) {
    if (busy) return;
    setBusy(true);
    setError("");

    try {
      await invitePatient(token, email);
      setInviteOpen(false);
      showSuccess("Convite disponível para aceite na conta do paciente.");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível criar o convite.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="nutri-heading">
        <span>ACOMPANHAMENTO</span>
        <h1>Meus pacientes</h1>
        <p>Pacientes vinculados e convites pendentes.</p>
      </header>
      <ErrorToast message={error} />

      <div className="nutri-actions">
        <button
          type="button"
          className="nutri-primary"
          disabled={busy}
          onClick={() => {
            setError("");
            setInviteOpen(true);
          }}
        >
          Enviar convite
        </button>
      </div>
      {inviteOpen && (
        <InvitePatientModal
          token={token}
          busy={busy}
          onClose={() => setInviteOpen(false)}
          onInvite={sendInvitation}
        />
      )}
      <br />
      <div className="nutri-toolbar">
        <label>
          Buscar paciente
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Nome"
          />
        </label>
      </div>
      <section className="nutri-card nutri-table-card">
        <table>
          <thead>
            <tr>
              <th>Paciente</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((patient) => (
              <tr key={patient.id}>
                <td data-label="Paciente">
                  <div className="nutri-person">
                    <b>{patient.name.slice(0, 1)}</b>
                    <span>
                      {patient.name}
                      <small>{patient.email}</small>
                    </span>
                  </div>
                </td>
                <td data-label="Status">{patient.pending_invitation ? "Pendente" : patient.status === "active" ? "Ativo" : "Bloqueado"}</td>
                <td data-label="Ações">
                  {patient.pending_invitation ? <span className="nutri-muted">Aguardando aceite</span> : <Link className="nutri-table-action" aria-label={`Abrir acompanhamento de ${patient.name}`} data-tooltip="Abrir acompanhamento" to={`/app/nutricionista/pacientes/${patient.id}`}><TableActionIcon name="open" /></Link>}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={3} className="nutri-empty">
                  Nenhum paciente encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <TablePagination page={page} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} onPageChange={setPage} />
      </section>
    </>
  );
}
