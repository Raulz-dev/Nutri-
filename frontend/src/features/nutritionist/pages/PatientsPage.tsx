import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { TablePagination } from "../../../components/shared/TablePagination";
import { ErrorToast } from "../../../components/ui/ErrorToast";
import { useAuth } from "../../auth/useAuth";
import {
  cancelLinkInvitation,
  invitePatient,
  listLinkInvitations,
  listPatients,
  type LinkInvitation,
  type PatientRow,
} from "../../care/api";

export function NutritionistPatientsPage() {
  const { session } = useAuth();
  const token = session?.accessToken ?? "";
  const [rows, setRows] = useState<PatientRow[]>([]);
  const [invitations, setInvitations] = useState<LinkInvitation[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [email, setEmail] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const refresh = useCallback(async () => {
    const [patients, pending] = await Promise.all([
      listPatients(token, (page - 1) * 10, search),
      listLinkInvitations(token),
    ]);
    setRows(patients.items);
    setTotal(patients.total);
    setInvitations(pending);
  }, [token, page, search]);

  useEffect(() => {
    refresh().catch((reason) => setError(reason instanceof Error ? reason.message : "Falha ao carregar pacientes."));
  }, [refresh]);

  async function sendInvitation(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await invitePatient(token, email);
      setEmail("");
      setNotice("Convite disponível para aceite na conta do paciente.");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível criar o convite.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelInvitation(id: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await cancelLinkInvitation(token, id);
      setNotice("Convite cancelado.");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível cancelar o convite.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <header className="nutri-heading"><span>ACOMPANHAMENTO</span><h1>Meus pacientes</h1><p>Pacientes atualmente vinculados à sua conta.</p></header>
    <ErrorToast message={error} />
    {notice && <p role="status" className="nutri-notice">{notice}</p>}
    <section className="nutri-card nutri-invitations">
      <h2>Convidar paciente</h2>
      <p>Convide um paciente já cadastrado e sem vínculo ativo. O vínculo será criado quando ele aceitar.</p>
      <form onSubmit={sendInvitation} className="nutri-invite-form">
        <label>E-mail do paciente<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <button type="submit" className="nutri-primary" disabled={busy}>Enviar convite</button>
      </form>
      {invitations.length > 0 && <div className="nutri-pending-invitations">
        <h3>Aguardando aceite</h3>
        <ul>{invitations.map((invitation) => <li key={invitation.id}>
          <span>{invitation.patient_name}</span>
          <button type="button" disabled={busy} onClick={() => cancelInvitation(invitation.id)}>Cancelar convite</button>
        </li>)}</ul>
      </div>}
    </section>
    <div className="nutri-toolbar"><label>Buscar paciente<input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Nome" /></label></div>
    <section className="nutri-card nutri-table-card"><table><thead><tr><th>Paciente</th><th>Status</th><th>Acompanhamento</th></tr></thead><tbody>
      {rows.map((patient) => <tr key={patient.id}><td data-label="Paciente"><div className="nutri-person"><b>{patient.name.slice(0, 1)}</b><span>{patient.name}<small>{patient.email}</small></span></div></td><td data-label="Status">{patient.status === "active" ? "Ativo" : "Bloqueado"}</td><td><Link to={`/app/nutricionista/pacientes/${patient.id}`}>Abrir acompanhamento →</Link></td></tr>)}
      {!rows.length && <tr><td colSpan={3} className="nutri-empty">Nenhum paciente vinculado.</td></tr>}
    </tbody></table><TablePagination page={page} totalPages={Math.max(1, Math.ceil(total / 10))} onPageChange={setPage} /></section>
  </>;
}
