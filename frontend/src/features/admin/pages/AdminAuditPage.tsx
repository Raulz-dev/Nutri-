import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../auth/useAuth";
import { ErrorToast } from "../../../components/ui/ErrorToast";
import { listAudit, type AuditEvent } from "../../care/api";
import { AdminShell } from "../AdminShell";
import { TablePagination } from "../components/TablePagination";

const labels: Record<string,string> = {
  create: "Cadastro", invite: "Convite", resend_invitation: "Reenvio", accept_invitation: "Primeiro acesso",
  login: "Entrada", update: "Atualização", deactivate: "Desativação",
  change_password: "Alteração de senha",
  assign: "Vínculo", transfer: "Transferência", unassign: "Desvínculo",
  invite_patient: "Convite ao paciente", accept_patient_invitation: "Aceite do paciente",
  decline_patient_invitation: "Recusa do paciente", cancel_patient_invitation: "Convite cancelado",
};

export function AdminAuditPage() {
  const { session } = useAuth();
  const token = session?.accessToken ?? "";
  const [items, setItems] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    const result = await listAudit(token, (page-1)*10, action);
    setItems(result.items); setTotal(result.total);
  }, [token, page, action]);
  useEffect(() => { refresh().catch(e => setError(e instanceof Error ? e.message : "Não foi possível carregar auditoria.")); }, [refresh]);
  return <AdminShell title="Auditoria" subtitle="Ações registradas pela plataforma.">
    <ErrorToast message={error} />
    <section className="admin-panel users-search-panel audit-search-panel"><div className="users-filters audit-filters"><label><span>Tipo de ação</span><select value={action} onChange={e => { setAction(e.target.value); setPage(1); }}><option value="">Todas as ações</option>{Object.entries(labels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label></div></section>
    <section className="admin-panel users-table-panel"><div className="users-table-wrap"><table className="users-table audit-table"><thead><tr><th>Ação</th><th>Responsável</th><th>Alvo</th><th>Data</th></tr></thead><tbody>
      {items.map(item => <tr key={item.id}><td data-label="Ação"><span className={`audit-action ${item.action}`}>{labels[item.action] ?? item.action}</span></td><td data-label="Responsável">{item.actor_name ?? "Sistema"}</td><td data-label="Alvo">{item.target_name ?? item.event_data.patient_id ?? item.entity_id ?? "—"}</td><td data-label="Data"><time dateTime={item.created_at}>{new Intl.DateTimeFormat("pt-BR", {dateStyle:"short",timeStyle:"short"}).format(new Date(item.created_at))}</time></td></tr>)}
      {!items.length && <tr><td colSpan={4} className="users-empty">Nenhum evento encontrado.</td></tr>}
    </tbody></table></div><TablePagination page={page} totalPages={Math.max(1,Math.ceil(total/10))} onPageChange={setPage}/></section>
  </AdminShell>;
}
