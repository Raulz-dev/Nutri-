import { Link } from "react-router-dom";

import { useAuth } from "../../auth/useAuth";
import type { User, UserRole } from "../../users/types";
import { AdminIcon, AdminShell } from "../AdminShell";
import { readAdminUsers, type AdminUser } from "../admin-users";

const roleLabels: Record<UserRole, string> = { patient: "Pacientes", nutritionist: "Nutricionistas", admin: "Administradores" };
const roleColors: Record<UserRole, string> = { patient: "#7142cd", nutritionist: "#2f927b", admin: "#d28a3e" };

export function AdminDashboardPage() {
  const { currentUser } = useAuth();
  const demoUsers = readAdminUsers().filter((user) => user.id !== currentUser?.id && user.email.toLowerCase() !== currentUser?.email.toLowerCase());
  const users: User[] = currentUser ? [currentUser, ...demoUsers] : demoUsers;
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);
  const counts = {
    total: users.length,
    active: users.filter((user) => user.status === "active").length,
    blocked: users.filter((user) => user.status === "blocked").length,
    recent: demoUsers.filter((user) => new Date(user.createdAt) >= thirtyDaysAgo).length,
  };
  const roles = (["patient", "nutritionist", "admin"] as const).map((role) => ({ role, value: users.filter((user) => user.role === role).length }));
  const months = buildMonthlySeries(demoUsers, now);
  const recentAccess = [...demoUsers].filter((user) => user.lastAccessAt).sort((a, b) => Date.parse(b.lastAccessAt ?? "") - Date.parse(a.lastAccessAt ?? "")).slice(0, 5);
  const activeRate = counts.total ? Math.round((counts.active / counts.total) * 100) : 0;

  return (
    <AdminShell title="Visão geral" subtitle="Indicadores e movimentações da base demonstrativa.">
      <section className="analytics-metrics" aria-label="Indicadores de usuários">
        <Metric label="Total de usuários" value={counts.total} detail="Base cadastrada" icon="users" />
        <Metric label="Usuários ativos" value={counts.active} detail={`${activeRate}% da base`} tone="green" icon="active" />
        <Metric label="Usuários bloqueados" value={counts.blocked} detail="Precisam de atenção" tone="red" icon="blocked" />
        <Metric label="Novos em 30 dias" value={counts.recent} detail="Cadastros recentes" tone="orange" icon="growth" />
      </section>

      <section className="analytics-main-grid">
        <article className="admin-panel registrations-panel">
          <PanelHeader label="Crescimento" title="Novos cadastros" detail="Últimos seis meses" />
          <MonthlyChart months={months} />
        </article>
        <article className="admin-panel roles-panel">
          <PanelHeader label="Composição" title="Usuários por perfil" detail="Distribuição atual" />
          <RoleChart roles={roles} total={counts.total} />
        </article>
      </section>

      <section className="analytics-secondary-grid">
        <article className="admin-panel activity-panel">
          <header className="analytics-panel-header"><div><span className="admin-section-label">Atividade</span><h2>Acessos recentes</h2><p>Últimas movimentações demonstrativas</p></div></header>
          <div className="recent-users">
            {recentAccess.map((user) => <RecentUser key={user.id} user={user} />)}
            {!recentAccess.length ? <p className="analytics-empty">Nenhum acesso recente.</p> : null}
          </div>
        </article>
        <aside className="analytics-side-column">
          <article className="admin-panel active-rate-card">
            <span className="admin-section-label">Situação da base</span>
            <div className="active-rate-heading"><strong>{activeRate}%</strong><span>dos usuários estão ativos</span></div>
            <div className="active-rate-track" role="img" aria-label={`${activeRate}% dos usuários estão ativos`}><span style={{ width: `${activeRate}%` }} /></div>
            <div className="active-rate-legend"><span><i className="active" />{counts.active} ativos</span><span><i className="blocked" />{counts.blocked} bloqueados</span></div>
          </article>
          <Link className="analytics-manage-link" to="/app/admin/pacientes"><span><small>Acesso rápido</small><strong>Gerenciar pacientes</strong></span><AdminIcon name="users" /></Link>
        </aside>
      </section>
    </AdminShell>
  );
}

function Metric({ label, value, detail, href, tone = "purple", icon }: { label: string; value: number; detail: string; href?: string; tone?: "purple" | "green" | "red" | "orange"; icon: "users" | "active" | "blocked" | "growth" }) {
  const content = <><span className={`analytics-metric-icon ${tone}`}><AnalyticsIcon name={icon} /></span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></>;
  return href ? <Link className="analytics-metric" to={href} aria-label={`${label}: ${value}. ${detail}`}>{content}</Link> : <article className="analytics-metric">{content}</article>;
}

function PanelHeader({ label, title, detail }: { label: string; title: string; detail: string }) {
  return <header className="analytics-panel-header"><div><span className="admin-section-label">{label}</span><h2>{title}</h2><p>{detail}</p></div></header>;
}

function MonthlyChart({ months }: { months: { key: string; label: string; value: number }[] }) {
  const maximum = Math.max(...months.map((month) => month.value), 1);
  const total = months.reduce((sum, month) => sum + month.value, 0);
  return <div className="monthly-chart" role="img" aria-label={`${total} novos cadastros distribuídos nos últimos seis meses`}>
    {months.map((month) => <div className="monthly-bar-column" key={month.key} aria-label={`${month.label}: ${month.value} cadastros`}><span>{month.value}</span><div><i style={{ height: `${month.value ? Math.max(14, (month.value / maximum) * 100) : 3}%` }} /></div><small>{month.label}</small></div>)}
  </div>;
}

function RoleChart({ roles, total }: { roles: { role: UserRole; value: number }[]; total: number }) {
  const patientEnd = total ? (roles[0].value / total) * 100 : 0;
  const nutritionistEnd = total ? patientEnd + (roles[1].value / total) * 100 : 0;
  const background = total ? `conic-gradient(${roleColors.patient} 0 ${patientEnd}%, ${roleColors.nutritionist} ${patientEnd}% ${nutritionistEnd}%, ${roleColors.admin} ${nutritionistEnd}% 100%)` : "#eeeaf2";
  return <div className="role-chart-layout">
    <div className="role-donut" role="img" aria-label={roles.map(({ role, value }) => `${roleLabels[role]}: ${value}`).join(", ")} style={{ background }}><span><strong>{total}</strong><small>Total</small></span></div>
    <div className="role-chart-legend">{roles.map(({ role, value }) => <Link to={role === "patient" ? "/app/admin/pacientes" : role === "nutritionist" ? "/app/admin/nutricionistas" : "/app/admin"} key={role}><i style={{ background: roleColors[role] }} /><span><strong>{value}</strong><small>{roleLabels[role]}</small></span><b>{total ? Math.round((value / total) * 100) : 0}%</b></Link>)}</div>
  </div>;
}

function RecentUser({ user }: { user: AdminUser }) {
  const path = user.role === "patient" ? "/app/admin/pacientes" : user.role === "nutritionist" ? "/app/admin/nutricionistas" : "/app/admin";
  return <Link className="recent-user" to={user.role === "admin" ? path : `${path}?q=${encodeURIComponent(user.email)}`}><span className="recent-user-avatar">{initials(user.name)}</span><span><strong>{user.name}</strong><small>{roleLabels[user.role]}</small></span><time dateTime={user.lastAccessAt ?? undefined}>{formatRelativeAccess(user.lastAccessAt)}</time></Link>;
}

function AnalyticsIcon({ name }: { name: "users" | "active" | "blocked" | "growth" }) {
  const paths = {
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></>,
    active: <><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></>,
    blocked: <><circle cx="12" cy="12" r="9"/><path d="M8.5 8.5l7 7"/></>,
    growth: <><path d="M4 17l5-5 4 3 7-8"/><path d="M15 7h5v5"/></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function buildMonthlySeries(users: AdminUser[], reference: Date) {
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(reference.getFullYear(), reference.getMonth() - (5 - index), 1);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const value = users.filter((user) => { const created = new Date(user.createdAt); return created.getFullYear() === date.getFullYear() && created.getMonth() === date.getMonth(); }).length;
    return { key, label: new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", ""), value };
  });
}

function formatRelativeAccess(value: string | null) {
  if (!value) return "Nunca acessou";
  const days = Math.floor(Math.max(0, Date.now() - Date.parse(value)) / 86_400_000);
  if (days === 0) return "Hoje";
  if (days === 1) return "Ontem";
  return `Há ${days} dias`;
}

function initials(name: string) { return name.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
