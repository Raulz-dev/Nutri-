import { Navigate, useNavigate, useParams } from "react-router-dom";

import { useAuth } from "../../auth/useAuth";
import { PatientIcon, type IconName } from "../components/PatientIcon";
import { patientMock, type PatientSection } from "../mocks/patient-data";
import { HomeSection } from "../sections/HomeSection";
import { MealPlanSection } from "../sections/MealPlanSection";
import { MessagesSection } from "../sections/MessagesSection";
import { ProfileSection } from "../sections/ProfileSection";
import { ProgressSection } from "../sections/ProgressSection";
import "../styles/patient.css";

const navigation: { id: PatientSection; label: string; icon: IconName; path: string }[] = [
  { id: "home", label: "Visão geral", icon: "home", path: "/app/paciente" },
  { id: "meal-plan", label: "Plano alimentar", icon: "meal", path: "/app/paciente/plano-alimentar" },
  { id: "progress", label: "Evolução", icon: "chart", path: "/app/paciente/evolucao" },
  { id: "messages", label: "Mensagens", icon: "message", path: "/app/paciente/mensagens" },
  { id: "profile", label: "Meu perfil", icon: "user", path: "/app/paciente/perfil" },
];

const sectionsBySlug: Record<string, PatientSection> = {
  "plano-alimentar": "meal-plan",
  evolucao: "progress",
  mensagens: "messages",
  perfil: "profile",
};

export function PatientDashboardPage() {
  const { section: sectionSlug } = useParams<{ section?: string }>();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const section = sectionSlug ? sectionsBySlug[sectionSlug] : "home";

  if (!section) return <Navigate to="/app/paciente" replace />;

  const hasFixedView = section === "home" || section === "profile" || section === "messages";

  function navigateToSection(target: PatientSection) {
    const item = navigation.find(({ id }) => id === target);
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
          {navigation.map((item) => (
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
              {item.id === "messages" ? <b>1</b> : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-user">
          <span>CF</span>
          <div>
            <strong>{patientMock.fullName}</strong>
            <small>Paciente</small>
          </div>
        </div>
        <button aria-label="Sair da conta" className="patient-logout" type="button" onClick={handleLogout}>
          <PatientIcon name="logout" />
          <span>Sair da conta</span>
        </button>
      </aside>

      <section className={`patient-content${hasFixedView ? " has-fixed-view" : ""}${section === "messages" ? " has-chat" : ""}`}>
        <header className="patient-header">
          <div>
            <span className="patient-kicker">{section === "home" ? "Terça-feira, 24 de setembro" : "Área do paciente"}</span>
            <h1>{section === "home" ? `Olá, ${patientMock.name}` : navigation.find((item) => item.id === section)?.label}</h1>
            {section === "home" ? <p>Veja como está seu acompanhamento hoje.</p> : null}
          </div>
          <div className="header-actions">
            <button className="patient-avatar" type="button" onClick={() => navigateToSection("profile")} aria-label="Abrir perfil">CF</button>
          </div>
        </header>

        {section === "home" ? <HomeSection onNavigate={navigateToSection} /> : null}
        {section === "meal-plan" ? <MealPlanSection /> : null}
        {section === "progress" ? <ProgressSection /> : null}
        {section === "messages" ? <MessagesSection /> : null}
        {section === "profile" ? <ProfileSection /> : null}
      </section>

      <nav className="patient-mobile-nav" aria-label="Navegação móvel">
        {navigation.map((item) => (
          <button
            key={item.id}
            aria-current={section === item.id ? "page" : undefined}
            className={section === item.id ? "is-active" : ""}
            type="button"
            onClick={() => navigate(item.path)}
          >
            <PatientIcon name={item.icon} />
            <small>{item.label.split(" ")[0]}</small>
          </button>
        ))}
      </nav>
    </main>
  );
}
