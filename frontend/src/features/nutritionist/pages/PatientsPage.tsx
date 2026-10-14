import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Modal } from "../components/Modal";
import { TablePagination } from "../../../components/shared/TablePagination";
import { ErrorToast, useSuccessToast } from "../../../components/ui/ErrorToast";
import { useAuth } from "../../auth/useAuth";
import { listInvitationCandidates, type InvitationCandidate, invitePatient, listPatients, type PatientRow } from "../../care/api";

const PAGE_SIZE = 5;

export function NutritionistPatientsPage() {
  const { session } = useAuth();
  const token = session?.accessToken ?? "";
  const [rows, setRows] = useState<PatientRow[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [candidatePage, setCandidatePage] = useState(1);
  const [candidates, setCandidates] = useState<InvitationCandidate[]>([]);
  const [candidateTotal, setCandidateTotal] = useState(0);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidateError, setCandidateError] = useState("");
  const [candidateRetry, setCandidateRetry] = useState(0);
  const [selectedPatient, setSelectedPatient] = useState<InvitationCandidate | null>(null);
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

  useEffect(() => {
    if (!inviteOpen) return;
    let active = true;
    setCandidateLoading(true);
    setCandidateError("");
    const timer = setTimeout(() => {
      listInvitationCandidates(token, candidateSearch, (candidatePage - 1) * 10)
        .then(result => { if (active) { setCandidates(result.items); setCandidateTotal(result.total); } })
        .catch(reason => { if (active) setCandidateError(reason instanceof Error ? reason.message : "Não foi possível buscar pacientes."); })
        .finally(() => { if (active) setCandidateLoading(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [inviteOpen, token, candidateSearch, candidatePage, candidateRetry]);

  async function sendInvitation(event: FormEvent) {
    event.preventDefault();
    if (busy || !selectedPatient) return;
    setBusy(true);
    setError("");

    try {
      await invitePatient(token, selectedPatient.email);
      setSelectedPatient(null);
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
            setSelectedPatient(null);
            setCandidateSearch("");
            setCandidatePage(1);
            setError("");
            setInviteOpen(true);
          }}
        >
          Enviar convite
        </button>
      </div>
      {inviteOpen && (
        <Modal
          title="Convidar paciente"
          onClose={() => {
            if (!busy) setInviteOpen(false);
          }}
        >
          <p>Convide um paciente já cadastrado e sem vínculo ativo. O vínculo será criado quando ele aceitar.</p>
          <form onSubmit={sendInvitation} className="nutri-form">
            <label>
              Buscar por nome ou e-mail
              <input maxLength={100} disabled={busy} value={candidateSearch} onChange={(event) => { setCandidateSearch(event.target.value); setCandidatePage(1); setSelectedPatient(null); }} placeholder="Nome ou e-mail do paciente" />
            </label>
            {candidateLoading ? <p role="status">Buscando pacientes...</p> : candidateError ? <div role="alert"><p>{candidateError}</p><button type="button" onClick={() => setCandidateRetry(value => value + 1)}>Tentar novamente</button></div> : <>
              <div className="nutri-invite-candidates" role="group" aria-label="Pacientes disponíveis">
                {candidates.map(patient => <button key={patient.id} type="button" disabled={busy} aria-pressed={selectedPatient?.id === patient.id} onClick={() => setSelectedPatient(patient)}>
                  <strong>{patient.name}</strong><small>{patient.email}</small>
                </button>)}
                {!candidates.length && <p>Nenhum paciente disponível encontrado.</p>}
              </div>
              <TablePagination page={candidatePage} totalPages={Math.max(1, Math.ceil(candidateTotal / 10))} onPageChange={value => { setCandidatePage(value); setSelectedPatient(null); }} />
            </>}
            {selectedPatient && <p role="status">Selecionado: <strong>{selectedPatient.name}</strong></p>}
            <div className="nutri-actions">
              <button type="button" disabled={busy} onClick={() => setInviteOpen(false)}>
                Cancelar
              </button>
              <button type="submit" className="nutri-primary" disabled={busy || !selectedPatient || candidateLoading || !!candidateError}>
                {busy ? "Enviando..." : "Enviar convite"}
              </button>
            </div>
          </form>
        </Modal>
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
              <th>Acompanhamento</th>
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
                <td>
                  {patient.pending_invitation ? <span className="nutri-muted">Aguardando aceite</span> : <Link to={`/app/nutricionista/pacientes/${patient.id}`}>Abrir acompanhamento →</Link>}
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
