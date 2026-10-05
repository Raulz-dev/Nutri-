import { useDemo } from "../../demo/store";
import { TablePagination } from "../components/TablePagination";
import { usePagination } from "../hooks/usePagination";
import { useModalBehavior } from "../../../hooks/useModalBehavior";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import type { UserStatus } from "../../users/types";
import { AdminIcon, AdminShell } from "../AdminShell";
import { readPatientLinks } from "../admin-links";
import { createAdminUser, readAdminUsers, type AdminUserInput } from "../admin-users";

export function AdminNutritionistsPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState(readAdminUsers);
  const sharedState = useDemo();
  useEffect(() => setUsers(readAdminUsers()), [sharedState]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<UserStatus | "all">("all");
  const nutritionists = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((user) => user.role === "nutritionist"
      && (statusFilter === "all" || user.status === statusFilter)
      && (!term || `${user.name} ${user.email}`.toLowerCase().includes(term)));
  }, [users, search, statusFilter]);
  const links = readPatientLinks();

  function create(input: AdminUserInput) {
    setUsers(createAdminUser(users, input));
    setOpen(false);
  }

  const pagination = usePagination(nutritionists, JSON.stringify([search, statusFilter]));

  return <AdminShell title="Nutricionistas" subtitle="Cadastre e acompanhe os profissionais da plataforma.">
    <div className="users-page-action"><button className="admin-primary-button" type="button" onClick={() => setOpen(true)}><AdminIcon name="plus" />Cadastrar nutricionista</button></div>
    <section className="admin-panel users-search-panel nutritionists-search-panel"><div className="users-filters">
      <label className="admin-search"><span className="sr-only">Pesquisar nutricionistas</span><AdminIcon name="search" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome ou e-mail" /></label>
      <label><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as UserStatus | "all")}><option value="all">Todos os status</option><option value="active">Ativos</option><option value="blocked">Bloqueados</option></select></label>
    </div></section>
    <section className="admin-panel users-table-panel">
      <div className="users-table-wrap"><table className="users-table nutritionists-table"><thead><tr><th>Nutricionista</th><th>Status</th><th>Pacientes vinculados</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>
        {pagination.items.map((user) => <tr key={user.id}><td data-label="Nutricionista"><div className="user-cell"><span>{initials(user.name)}</span><div><strong>{user.name}</strong><small>{user.email}</small></div></div></td><td data-label="Status"><span className={`status-badge ${user.status}`}><i />{user.status === "active" ? "Ativo" : "Bloqueado"}</span></td><td data-label="Pacientes vinculados"><strong className="nutritionist-patient-count">{links.filter((link) => link.nutritionistId === user.id).length}</strong></td><td data-label="Ações"><div className="row-actions"><button className="icon-action" type="button" onClick={() => navigate(`/app/admin/usuarios?role=nutritionist&q=${encodeURIComponent(user.email)}`)} aria-label={`Gerenciar ${user.name}`} data-tooltip="Gerenciar nutricionista"><AdminIcon name="edit" /></button></div></td></tr>)}
        {!nutritionists.length ? <tr><td className="users-empty" colSpan={4}>Nenhum nutricionista corresponde aos filtros.</td></tr> : null}
      </tbody></table></div>
      <TablePagination {...pagination} />
    </section>
    {open ? <NutritionistModal users={users} onClose={() => setOpen(false)} onSave={create} /> : null}
  </AdminShell>;
}

function NutritionistModal({ users, onClose, onSave }: { users: ReturnType<typeof readAdminUsers>; onClose: () => void; onSave: (input: AdminUserInput) => void }) {
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [status, setStatus] = useState<UserStatus>("active"); const [error, setError] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  useModalBehavior(dialogRef, onClose);
  function submit(event: FormEvent) { event.preventDefault(); const normalized = email.trim().toLowerCase(); if (name.trim().length < 2) return setError("Informe um nome válido."); if (!/^\S+@\S+\.\S+$/.test(normalized)) return setError("Informe um e-mail válido."); if (users.some((user) => user.email.toLowerCase() === normalized)) return setError("Este e-mail já está em uso."); onSave({ name, email, status, role: "nutritionist" }); }
  return <div className="admin-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section ref={dialogRef} className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="nutritionist-title"><header><div><span className="admin-section-label">Novo profissional</span><h2 id="nutritionist-title">Cadastrar nutricionista</h2></div><button className="admin-modal-close" type="button" onClick={onClose} aria-label="Fechar">×</button></header><p className="modal-helper">O cadastro é demonstrativo e não cria credenciais de acesso.</p><form onSubmit={submit}><label><span>Nome completo</span><input data-modal-initial-focus value={name} onChange={(event) => { setName(event.target.value); setError(""); }} /></label><label><span>E-mail</span><input type="email" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} /></label><label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value as UserStatus)}><option value="active">Ativo</option><option value="blocked">Bloqueado</option></select></label>{error ? <p className="admin-form-error" role="alert">{error}</p> : null}<div className="admin-modal-actions"><button type="button" onClick={onClose}>Cancelar</button><button className="admin-primary-button" type="submit">Cadastrar</button></div></form></section></div>;
}

function initials(name: string) { return name.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
