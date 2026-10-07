import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/useAuth";
import { readAdminSettings, type AdminSettings } from "./admin-settings";
import "./admin.css";

export function AdminShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const fallback = { name: currentUser?.name ?? "Administrador", email: currentUser?.email ?? "", emailNotifications: true };
  const [account, setAccount] = useState(() => readAdminSettings(fallback));
  const initials = account.name.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "AD";

  useEffect(() => {
    function update(event: Event) { setAccount((event as CustomEvent<AdminSettings>).detail); }
    window.addEventListener("admin-settings-changed", update);
    return () => window.removeEventListener("admin-settings-changed", update);
  }, []);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <main className="admin-app">
      <aside className="admin-sidebar">
        <div className="admin-brand"><span>Nutri</span><b>+</b><small>Admin</small></div>
        <nav aria-label="Administração">
          <NavLink to="/app/admin" end><AdminIcon name="dashboard" /><span>Visão geral</span></NavLink>
          <NavLink to="/app/admin/pacientes"><AdminIcon name="users" /><span>Pacientes</span></NavLink>
          <NavLink to="/app/admin/nutricionistas"><AdminIcon name="nutritionist" /><span>Nutricionistas</span></NavLink>
          <NavLink to="/app/admin/chat"><AdminIcon name="chat" /><span>Chat</span></NavLink>
          <NavLink to="/app/admin/auditoria"><AdminIcon name="audit" /><span>Auditoria</span></NavLink>
          <NavLink to="/app/admin/configuracoes"><AdminIcon name="settings" /><span>Configurações</span></NavLink>
        </nav>
        <div className="admin-account">
          <span>{initials}</span>
          <div><strong>{account.name}</strong><small>Administrador</small></div>
        </div>
        <button className="admin-logout" type="button" onClick={handleLogout}><AdminIcon name="logout" /><span>Sair</span></button>
      </aside>

      <section className="admin-main">
        <header className="admin-header">
          <div><span className="admin-kicker">Área administrativa</span><h1>{title}</h1><p>{subtitle}</p></div>
          <span className="admin-header-avatar" aria-label={`Usuário: ${account.name}`}>{initials}</span>
        </header>
        {children}
      </section>
    </main>
  );
}

export function AdminIcon({ name }: { name: "dashboard" | "users" | "nutritionist" | "link" | "chat" | "audit" | "settings" | "logout" | "search" | "plus" | "invite" | "edit" | "lock" | "unlock" | "trash" | "unlink" | "chevronLeft" | "chevronRight" }) {
  const paths = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    nutritionist: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    link: <><path d="M9.5 14.5 14.5 9.5"/><path d="M7 17H6a5 5 0 0 1 0-10h4"/><path d="M17 7h1a5 5 0 0 1 0 10h-4"/></>,
    chat: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3 1.7-5.1A7 7 0 0 1 3 12V8a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 10h8M8 14h5"/></>,
    audit: <><path d="M9 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M2 12h3M19 12h3M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12"/></>,
    logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    invite: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></>,
    edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4z"/></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    unlock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-2"/></>,
    trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"/></>,
    unlink: <><path d="m9.5 14.5 5-5M7 17H6a5 5 0 0 1-4-8M17 7h1a5 5 0 0 1 4 8M3 3l18 18"/></>,
    chevronLeft: <path d="m15 18-6-6 6-6"/>,
    chevronRight: <path d="m9 18 6-6-6-6"/>,
  };
  return <svg className="admin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
