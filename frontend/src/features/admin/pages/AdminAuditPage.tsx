import { TablePagination } from "../components/TablePagination";
import { usePagination } from "../hooks/usePagination";
import { useMemo, useState } from "react";

import { AdminIcon, AdminShell } from "../AdminShell";
import { readAuditEntries, type AuditAction } from "../admin-audit";

const labels: Record<AuditAction, string> = { create: "Cadastro", update: "Edição", status: "Status", delete: "Exclusão", link: "Vínculo", unlink: "Desvínculo", settings: "Configuração", password: "Senha" };

export function AdminAuditPage() {
  const [entries] = useState(readAuditEntries); const [search, setSearch] = useState(""); const [action, setAction] = useState<AuditAction | "all">("all");
  const filtered = useMemo(() => entries.filter((entry) => (action === "all" || entry.action === action) && (!search.trim() || `${entry.target} ${entry.detail}`.toLowerCase().includes(search.trim().toLowerCase()))), [entries, search, action]);
  const pagination = usePagination(filtered, JSON.stringify([search, action]));

  return <AdminShell title="Auditoria" subtitle="Consulte o histórico das ações administrativas demonstrativas.">
    <section className="admin-panel users-search-panel audit-search-panel"><div className="users-filters audit-filters"><label className="admin-search"><span className="sr-only">Pesquisar auditoria</span><AdminIcon name="search" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar alvo ou descrição" /></label><label><span>Tipo de ação</span><select value={action} onChange={(event) => setAction(event.target.value as AuditAction | "all")}><option value="all">Todas as ações</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div></section>
    <section className="admin-panel users-table-panel"><div className="users-table-wrap"><table className="users-table audit-table"><thead><tr><th>Ação</th><th>Alvo</th><th>Descrição</th><th>Data</th></tr></thead><tbody>
      {pagination.items.map((entry) => <tr key={entry.id}><td data-label="Ação"><span className={`audit-action ${entry.action}`}>{labels[entry.action]}</span></td><td data-label="Alvo"><strong>{entry.target}</strong></td><td data-label="Descrição"><span className="audit-detail">{entry.detail}</span></td><td data-label="Data"><time dateTime={entry.occurredAt}>{formatDate(entry.occurredAt)}</time></td></tr>)}
      {!filtered.length ? <tr><td className="users-empty" colSpan={4}>Nenhum evento corresponde aos filtros.</td></tr> : null}
    </tbody></table></div>
      <TablePagination {...pagination} />
    </section>
  </AdminShell>;
}
function formatDate(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
