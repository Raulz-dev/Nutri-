import { PatientContext, usePatientData } from "../../demo/PatientContext";
import { useDemo, demoUsers, initials } from "../../demo/store";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";

import { useAuth } from "../../auth/useAuth";
import { PatientIcon, type IconName } from "../components/PatientIcon";
import { type PatientSection } from "../mocks/patient-data";
import { HomeSection } from "../sections/HomeSection";
import { MealPlanSection } from "../sections/MealPlanSection";
import { MessagesSection } from "../sections/MessagesSection";
import { PatientPreferencesSection } from "../sections/PatientPreferencesSection";
import { ProfileSection } from "../sections/ProfileSection";
import { ProgressSection } from "../sections/ProgressSection";
import "../styles/patient.css";

const navigation: { id: PatientSection; label: string; mobileLabel?: string; icon: IconName; path: string }[] = [
  { id: "home", label: "Visão geral", icon: "home", path: "/app/paciente" },
  { id: "meal-plan", label: "Plano alimentar", icon: "meal", path: "/app/paciente/plano-alimentar" },
  { id: "progress", label: "Evolução", icon: "chart", path: "/app/paciente/evolucao" },
  { id: "messages", label: "Mensagens", icon: "message", path: "/app/paciente/mensagens" },
  { id: "preferences", label: "Preferências", mobileLabel: "Prefer.", icon: "target", path: "/app/paciente/preferencias" },
  { id: "profile", label: "Meu perfil", icon: "user", path: "/app/paciente/perfil" },
];

const sectionsBySlug: Record<string, PatientSection> = {
  "plano-alimentar": "meal-plan",
  evolucao: "progress",
  mensagens: "messages",
  preferencias: "preferences",
  perfil: "profile",
};

export function PatientDashboardPage() {
  const { patientId } = useParams();
  const { currentUser } = useAuth();
  const state = useDemo();
  if (patientId && (!state.links.some(l => l.patientId === patientId && l.nutritionistId === currentUser?.id) || !demoUsers(state).some(u => u.id === patientId))) return <Navigate to="/app/nutricionista/pacientes" replace />;
  return <PatientContext.Provider value={patientId ?? null}><PatientDashboardContent key={patientId ?? currentUser?.id}/></PatientContext.Provider>;
}

function PatientDashboardContent() {
  const { view: patientData, patientId, state } = usePatientData();
  const { patientId: previewId } = useParams();
  const basePath = previewId ? `/app/nutricionista/pacientes/${previewId}/previa` : "/app/paciente";
  const menu = navigation.map(item => ({ ...item, path: item.path.replace("/app/paciente", basePath) }));
  const conversationId = state.links.find(l => l.patientId === patientId)?.conversationId;
  const unread = state.conversations.find(c => c.id === conversationId)?.messages.filter(m => m.sender === "nutritionist" && !m.read).length ?? 0;
  const { section: sectionSlug } = useParams<{ section?: string }>();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const section = sectionSlug ? sectionsBySlug[sectionSlug] : "home";

  if (!section) return <Navigate to={basePath} replace />;

  const hasFixedView = section === "home" || section === "profile" || section === "messages";

  function navigateToSection(target: PatientSection) {
    const item = menu.find(({ id }) => id === target);
    if (item) navigate(item.path);
  }

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <main className="patient-app">
      <aside className="patient-sidebar">
        <div className="brand patient-brand">
          <span>Nutri</span>
          <span className="brand__symbol">+</span>
        </div>
        <div className="patient-menu-label">Menu</div>
        <nav aria-label="Área do paciente">
          {menu.map((item) => (
            <button
              key={item.id}
              aria-label={item.label}
              aria-current={section === item.id ? "page" : undefined}
              className={section === item.id ? "is-active" : ""}
              type="button"
              onClick={() => navigate(item.path)}
            >
              <PatientIcon name={item.icon} />
              <span>{item.label}</span>
              {item.id === "messages" && unread > 0 ? <b>{unread}</b> : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-user">
          <span>{initials(patientData.fullName)}</span>
          <div>
            <strong>{patientData.fullName}</strong>
            <small>Paciente</small>
          </div>
        </div>
        <button aria-label="Sair da conta" className="patient-logout" type="button" onClick={handleLogout}>
          <PatientIcon name="logout" />
          <span>Sair da conta</span>
        </button>
      </aside>

      <section className={`patient-content${hasFixedView ? " has-fixed-view" : ""}${section === "messages" ? " has-chat" : ""}`}>
        {previewId && <div className="patient-preview-notice"><span>Prévia demonstrativa · {patientData.fullName}</span><Link to={`/app/nutricionista/pacientes/${previewId}`}>Voltar ao acompanhamento</Link></div>}
        <header className="patient-header">
          <div>
            <span className="patient-kicker">{section === "home" ? new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }) : "Área do paciente"}</span>
            <h1>{section === "home" ? `Olá, ${patientData.name}` : menu.find((item) => item.id === section)?.label}</h1>
            {section === "home" ? <p>Veja como está seu acompanhamento hoje.</p> : null}
          </div>
          <div className="header-actions">
            <button className="patient-avatar" type="button" onClick={() => navigateToSection("profile")} aria-label="Abrir perfil">{initials(patientData.fullName)}</button>
          </div>
        </header>

        {section === "home" ? <HomeSection onNavigate={navigateToSection} /> : null}
        {section === "meal-plan" ? <MealPlanSection /> : null}
        {section === "progress" ? <ProgressSection /> : null}
        {section === "messages" ? <MessagesSection /> : null}
        {section === "preferences" ? <PatientPreferencesSection /> : null}
        {section === "profile" ? <ProfileSection /> : null}
      </section>

      <nav className="patient-mobile-nav" aria-label="Navegação móvel">
        {menu.map((item) => (
          <button
            key={item.id}
            aria-current={section === item.id ? "page" : undefined}
            className={section === item.id ? "is-active" : ""}
            type="button"
            onClick={() => navigate(item.path)}
          >
            <PatientIcon name={item.icon} />
            <small>{item.mobileLabel ?? item.label.split(" ")[0]}</small>
          </button>
        ))}
      </nav>
    </main>
  );
}
