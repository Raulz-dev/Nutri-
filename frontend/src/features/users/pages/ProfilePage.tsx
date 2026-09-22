import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../../auth/useAuth";
import { getCurrentUser } from "../api";
import type { User } from "../types";

export function ProfilePage() {
  const navigate = useNavigate();
  const { session, logout } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session) return;
    getCurrentUser(session.accessToken).then(setUser).catch(() => setError("Sessão inválida."));
  }, [session]);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <main className="profile-page">
      <section className="profile-card">
        <div className="brand">
          <span>Nutri</span>
          <span className="brand__symbol">+</span>
        </div>
        {error ? <p role="alert">{error}</p> : null}
        {!error && !user ? <p>Carregando perfil...</p> : null}
        {user ? (
          <>
            <span className="eyebrow">Login realizado</span>
            <h1>Olá, {user.name}</h1>
            <p>{user.email}</p>
            <Link to="/app/paciente">Ver demonstração da área do paciente</Link>
            <button className="button" type="button" onClick={handleLogout}>
              Sair
            </button>
          </>
        ) : null}
      </section>
    </main>
  );
}
