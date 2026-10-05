import { useDemo } from "../../demo/store";
import { TablePagination } from "../components/TablePagination";
import { usePagination } from "../hooks/usePagination";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { useAuth } from "../../auth/useAuth";
import type { User, UserRole, UserStatus } from "../../users/types";
import { AdminIcon, AdminShell } from "../AdminShell";
import { createAdminUser, deleteAdminUser, readAdminUsers, toggleAdminUserStatus, updateAdminUser, type AdminUserInput } from "../admin-users";

import { UserModal } from "../components/users/UserModal";
import { ConfirmModal } from "../components/users/ConfirmModal";

const roleLabels: Record<UserRole, string> = { admin: "Administrador", nutritionist: "Nutricionista", patient: "Paciente" };
const statusLabels: Record<UserStatus, string> = { active: "Ativo", blocked: "Bloqueado" };

export function AdminUsersPage() {
  const { currentUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [demoUsers, setDemoUsers] = useState(readAdminUsers);
  const sharedState = useDemo();
  useEffect(() => setDemoUsers(readAdminUsers()), [sharedState]);
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [role, setRole] = useState<UserRole | "all">(() => parseRole(searchParams.get("role")));
  const [status, setStatus] = useState<UserStatus | "all">(() => parseStatus(searchParams.get("status")));
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const [deleting, setDeleting] = useState<User | null>(null);

  const users = useMemo(() => {
    const withoutCurrent = demoUsers.filter((user) => user.id !== currentUser?.id && user.email.toLowerCase() !== currentUser?.email.toLowerCase());
    return currentUser ? [currentUser, ...withoutCurrent] : withoutCurrent;
  }, [currentUser, demoUsers]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter(
      (user) =>
        (!term || user.name.toLowerCase().includes(term) || user.email.toLowerCase().includes(term)) &&
        (role === "all" || user.role === role) &&
        (status === "all" || user.status === status),
    );
  }, [users, search, role, status]);
  const pagination = usePagination(filtered, JSON.stringify([search, role, status]));

  useEffect(() => {
    const next = new URLSearchParams();
    if (search.trim()) next.set("q", search.trim());
    if (role !== "all") next.set("role", role);
    if (status !== "all") next.set("status", status);
    setSearchParams(next, { replace: true });
  }, [search, role, status, setSearchParams]);

  function saveUser(input: AdminUserInput) {
    if (editing === "new") setDemoUsers(createAdminUser(demoUsers, input));
    else if (editing) setDemoUsers(updateAdminUser(demoUsers, editing.id, input));
    setEditing(null);
  }

  function toggleStatus(user: User) {
    if (user.id === currentUser?.id) return;
    setDemoUsers(toggleAdminUserStatus(demoUsers, user.id));
  }

  function confirmDelete() {
    if (!deleting || deleting.id === currentUser?.id) return;
    setDemoUsers(deleteAdminUser(demoUsers, deleting.id));
    setDeleting(null);
  }

  return (
    <AdminShell title="Usuários" subtitle="Gerencie os registros demonstrativos da plataforma.">
      <div className="users-page-action">
          <button className="admin-primary-button" type="button" onClick={() => setEditing("new")}>
            <AdminIcon name="plus" />
            Novo usuário
          </button>
      </div>

      <section className="admin-panel users-search-panel">
        <div className="users-filters">
          <label className="admin-search">
            <span className="sr-only">Pesquisar usuários</span>
            <AdminIcon name="search" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome ou e-mail" />
          </label>
          <label>
            <span>Perfil</span>
            <select value={role} onChange={(event) => setRole(event.target.value as UserRole | "all")}>
              <option value="all">Todos os perfis</option>
              <option value="patient">Pacientes</option>
              <option value="nutritionist">Nutricionistas</option>
              <option value="admin">Administradores</option>
            </select>
          </label>
          <label>
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as UserStatus | "all")}>
              <option value="all">Todos os status</option>
              <option value="active">Ativos</option>
              <option value="blocked">Bloqueados</option>
            </select>
          </label>
        </div>
      </section>

      <section className="admin-panel users-table-panel">
        <div className="users-table-wrap">
          <table className="users-table">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Perfil</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {pagination.items.map((user) => {
                const isCurrent = user.id === currentUser?.id;
                return (
                  <tr key={user.id}>
                    <td data-label="Usuário">
                      <div className="user-cell">
                        <span>{initials(user.name)}</span>
                        <div>
                          <strong>
                            {user.name}
                            {isCurrent ? <small className="you-label">Você</small> : null}
                          </strong>
                          <small>{user.email}</small>
                        </div>
                      </div>
                    </td>
                    <td data-label="Perfil">
                      <span className={`role-badge ${user.role}`}>{roleLabels[user.role]}</span>
                    </td>
                    <td data-label="Status">
                      <span className={`status-badge ${user.status}`}>
                        <i />
                        {statusLabels[user.status]}
                      </span>
                    </td>
                    <td data-label="Ações">
                      <div className="row-actions">
                        <button className="icon-action"
                          type="button"
                          disabled={isCurrent}
                          onClick={() => setEditing(user)}
                          aria-label="Editar usuário"
                          data-tooltip={isCurrent ? "A conta atual não pode ser editada" : "Editar usuário"}
                        >
                          <AdminIcon name="edit" />
                        </button>
                        <button className="icon-action" type="button" disabled={isCurrent} onClick={() => toggleStatus(user)} aria-label={user.status === "active" ? "Bloquear usuário" : "Ativar usuário"} data-tooltip={isCurrent ? "A conta atual não pode ser bloqueada" : user.status === "active" ? "Bloquear usuário" : "Ativar usuário"}>
                          <AdminIcon name={user.status === "active" ? "lock" : "unlock"} />
                        </button>
                        <button className="icon-action danger" type="button" disabled={isCurrent} onClick={() => setDeleting(user)} aria-label="Excluir usuário" data-tooltip={isCurrent ? "A conta atual não pode ser excluída" : "Excluir usuário"}>
                          <AdminIcon name="trash" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!pagination.items.length ? (
                <tr>
                  <td className="users-empty" colSpan={4}>
                    Nenhum usuário corresponde aos filtros.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <TablePagination {...pagination} />
      </section>

      {editing ? (
        <UserModal user={editing === "new" ? null : editing} existingUsers={users} onClose={() => setEditing(null)} onSave={saveUser} />
      ) : null}
      {deleting ? <ConfirmModal user={deleting} onClose={() => setDeleting(null)} onConfirm={confirmDelete} /> : null}
    </AdminShell>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function parseRole(value: string | null): UserRole | "all" {
  return value === "admin" || value === "nutritionist" || value === "patient" ? value : "all";
}

function parseStatus(value: string | null): UserStatus | "all" {
  return value === "active" || value === "blocked" ? value : "all";
}
