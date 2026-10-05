import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/useAuth";
import { initials, useDemo } from "../../demo/store";
import {
  PatientIcon,
  type IconName,
} from "../../patient/components/PatientIcon";
import "../../patient/styles/patient.css";
import "../styles/nutritionist.css";
const items: { path: string; label: string; icon: IconName }[] = [
  { path: "", label: "Visão geral", icon: "home" },
  { path: "/pacientes", label: "Meus pacientes", icon: "user" },
  { path: "/consultas", label: "Consultas", icon: "calendar" },
  { path: "/mensagens", label: "Mensagens", icon: "message" },
  { path: "/perfil", label: "Meu perfil", icon: "user" },
];
export function NutritionistLayout() {
  const { currentUser, logout } = useAuth();
  const state = useDemo();
  const navigate = useNavigate();
  const name = state.profiles[currentUser!.id]?.name || currentUser!.name;
  return (
    <div className="nutri-app">
      <aside className="nutri-sidebar">
        <div className="nutri-brand">
          Nutri<span>+</span>
          <small>Nutricionista</small>
        </div>
        <nav aria-label="Área do nutricionista">
          {items.map((item) => (
            <NavLink
              key={item.path}
              to={`/app/nutricionista${item.path}`}
              end={!item.path}
            >
              <PatientIcon name={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="nutri-account">
          <b>{initials(name)}</b>
          <span>
            {name}
            <small>Nutricionista</small>
          </span>
        </div>
        <button
          className="nutri-logout"
          onClick={async () => {
            try {
              await logout();
            } finally {
              navigate("/login", { replace: true });
            }
          }}
        >
          <PatientIcon name="logout" />
          Sair
        </button>
      </aside>
      <main className="nutri-main">
        <div className="nutri-demo-label">
          Demonstração · alterações salvas neste navegador
        </div>
        <Outlet />
      </main>
    </div>
  );
}
