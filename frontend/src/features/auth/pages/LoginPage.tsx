import { Navigate } from "react-router-dom";

import { LoginForm } from "../LoginForm";
import { useAuth } from "../useAuth";

export function LoginPage() {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return <Navigate to="/app/perfil" replace />;

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-card__content">
          <div className="brand" aria-label="Mais Saúde">
            <span className="brand__symbol">+</span>
            <span>Saúde</span>
          </div>

          <div className="login-card__heading">
            <span className="eyebrow">Sua saúde em movimento</span>
            <h1 id="login-title">Bem-vindo de volta</h1>
            <p>Acesse sua conta para continuar seu acompanhamento.</p>
          </div>

          <LoginForm />

          <p className="login-card__support">
            Precisa de ajuda? <a href="mailto:suporte@maissaude.com">Fale com o suporte</a>
          </p>
        </div>

        <div className="login-card__visual" aria-hidden="true">
          <img src="/assets/runner-health.png" alt="" />
          <div className="visual-copy">
            <span className="visual-copy__badge">Cuidado que acompanha</span>
            <p>Pequenos passos constroem uma vida mais saudável.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
