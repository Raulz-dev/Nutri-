import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/useAuth";
import { ErrorToast } from "../../../components/ui/ErrorToast";
import { deactivateUser, inviteNutritionist, listAllUsers, listInvitationStatuses, resendInvitation, updateUser, type InvitationDeliveryStatus } from "../../care/api";
import type { User } from "../../users/types";
import { AdminIcon, AdminShell } from "../AdminShell";
import { ConfirmModal } from "../components/users/ConfirmModal";
import { InviteNutritionistModal } from "../components/users/InviteNutritionistModal";
import { TablePagination } from "../components/TablePagination";
import { usePagination } from "../hooks/usePagination";

export function AdminNutritionistsPage() {
  const { session } = useAuth();
  const token = session?.accessToken ?? "";
  const [params] = useSearchParams();
  const [users, setUsers] = useState<User[]>([]);
  const [invitationStatuses, setInvitationStatuses] = useState<Record<string, InvitationDeliveryStatus>>({});
  const [now, setNow] = useState(Date.now());
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [inviting, setInviting] = useState(false);
  const [deleting, setDeleting] = useState<User | null>(null);
  const [error, setError] = useState("");
  const [modalError, setModalError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => setUsers(await listAllUsers(token)), [token]);
  const refreshStatuses = useCallback(async () => {
    const statuses = await listInvitationStatuses(token);
    setInvitationStatuses(Object.fromEntries(statuses.map(status => [status.user_id, status])));
  }, [token]);
  useEffect(() => {
    refresh().catch(reason => setError(reason instanceof Error ? reason.message : "Falha ao carregar nutricionistas."));
    refreshStatuses().catch(reason => setError(reason instanceof Error ? reason.message : "Falha ao carregar convites."));
  }, [refresh, refreshStatuses]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!users.some(user => user.first_access_pending)) return;
    const timer = window.setInterval(() => {
      refresh().catch(reason => setError(reason instanceof Error ? reason.message : "Falha ao atualizar nutricionistas."));
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [users, refresh]);
  useEffect(() => {
    if (!users.some(user => user.first_access_pending && (!invitationStatuses[user.id] || invitationStatuses[user.id].status === "pending"))) return;
    const timer = window.setInterval(() => {
      refreshStatuses().catch(reason => setError(reason instanceof Error ? reason.message : "Falha ao atualizar convites."));
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [users, invitationStatuses, refreshStatuses]);
  const nutritionists = useMemo(() => users.filter(user => user.role === "nutritionist" && `${user.name} ${user.email}`.toLowerCase().includes(search.toLowerCase())), [users, search]);
  const pagination = usePagination(nutritionists, search);

  async function invite(name: string, email: string) {
    setBusy(true); setModalError(""); setNotice("");
    try {
      await inviteNutritionist(token, name, email);
      setInviting(false);
      setNotice("Convite registrado para envio por e-mail.");
      try { await Promise.all([refresh(), refreshStatuses()]); }
      catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível atualizar a lista de nutricionistas."); }
    } catch (reason) {
      setModalError(reason instanceof Error ? reason.message : "Não foi possível registrar o convite.");
    } finally { setBusy(false); }
  }

  async function resend(user: User) {
    setBusy(true); setError(""); setNotice("");
    try {
      await resendInvitation(token, user.id);
      setNotice(`Novo convite registrado para ${user.email}.`);
      await Promise.all([refresh(), refreshStatuses()]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível reenviar o convite.");
    } finally { setBusy(false); }
  }

  async function toggle(user: User) {
    setBusy(true); setError(""); setNotice("");
    try {
      await updateUser(token, user.id, { status: user.status === "active" ? "blocked" : "active" });
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

  return <AdminShell title="Nutricionistas" subtitle="Convide profissionais e gerencie suas contas.">
    <ErrorToast message={error} />
    {notice && <p className="admin-form-message" role="status">{notice}</p>}
    <div className="users-page-action"><button type="button" className="admin-primary-button" onClick={() => { setModalError(""); setInviting(true); }}><AdminIcon name="plus"/> Convidar nutricionista</button></div>
    <section className="admin-panel users-search-panel"><div className="users-filters"><label className="admin-search"><span className="sr-only">Pesquisar nutricionistas</span><AdminIcon name="search"/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Nome ou e-mail" /></label></div></section>
    <section className="admin-panel users-table-panel"><div className="users-table-wrap"><table className="users-table nutritionists-table"><thead><tr><th>Nutricionista</th><th>Status</th><th>Ações</th></tr></thead><tbody>
      {pagination.items.map(user => {
        const invitation = invitationStatuses[user.id];
        const resendAt = invitation?.resend_available_at ? Date.parse(invitation.resend_available_at) : NaN;
        const canResend = invitation?.status === "failed" || invitation?.status === "expired" || (invitation?.status === "sent" && now >= resendAt);
        const invitationLabel = !invitation ? "Verificando envio" : invitation.status === "sent" ? "Enviado" : invitation.status === "failed" ? "Falha no envio" : invitation.status === "expired" ? "Expirado" : "Aguardando envio";
        return <tr key={user.id}>
        <td data-label="Nutricionista"><div className="user-cell"><span>{user.name.split(" ").map(part => part[0]).slice(0, 2).join("")}</span><div><strong>{user.name}</strong><small>{user.email}</small></div></div></td>
        <td data-label="Status">{user.deactivated_at ? "Desativado" : user.first_access_pending ? <span className="invitation-status">{invitationLabel}{invitation?.status === "sent" && !canResend && <small>Reenvio disponível às {new Date(resendAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</small>}</span> : user.status === "active" ? "Ativo" : "Bloqueado"}</td>
        <td data-label="Ações"><div className="row-actions">
          {user.first_access_pending && <button type="button" className="icon-action" disabled={busy || !canResend} onClick={() => resend(user)} aria-label={`Reenviar convite para ${user.name}`} data-tooltip="Reenviar convite"><AdminIcon name="invite" /></button>}
          <button type="button" className="icon-action" disabled={busy || Boolean(user.deactivated_at) || Boolean(user.first_access_pending)} onClick={() => toggle(user)} aria-label={user.status === "active" ? `Bloquear ${user.name}` : `Ativar ${user.name}`} data-tooltip="Alterar acesso"><AdminIcon name={user.status === "active" ? "lock" : "unlock"} /></button>
          <button type="button" className="icon-action danger" disabled={busy || Boolean(user.deactivated_at)} onClick={() => { setModalError(""); setDeleting(user); }} aria-label={`Desativar ${user.name}`} data-tooltip="Desativar nutricionista"><AdminIcon name="trash" /></button>
        </div></td>
      </tr>})}
      {!pagination.items.length && <tr><td className="users-empty" colSpan={3}>Nenhum nutricionista encontrado.</td></tr>}
    </tbody></table></div><TablePagination {...pagination} /></section>
    {inviting && <InviteNutritionistModal busy={busy} error={modalError} onClose={() => setInviting(false)} onSubmit={invite} />}
    {deleting && <ConfirmModal user={deleting} busy={busy} error={modalError} onClose={() => setDeleting(null)} onConfirm={deactivate} />}
  </AdminShell>;
}
