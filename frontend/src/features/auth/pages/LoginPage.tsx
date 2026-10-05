import { AuthLayout } from "../layouts/AuthLayout";
import { Navigate } from "react-router-dom";

import { LoginForm } from "../LoginForm";
import { useAuth } from "../useAuth";

export function LoginPage() {
  const { currentUser, isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <main className="route-loading">Carregando...</main>;
  if (isAuthenticated && currentUser) {
    const destination = currentUser.role === "admin" ? "/app/admin" : currentUser.role === "patient" ? "/app/paciente" : "/app/nutricionista";
    return <Navigate to={destination} replace />;
  }

  return (
    <AuthLayout
      titleId="login-title"
      eyebrow="Sua saúde em movimento"
      title="Bem-vindo de volta"
      badge="Cuidado que acompanha"
      visualText="Pequenos passos constroem uma vida mais saudável."
    >
      <LoginForm />
    </AuthLayout>
  );
}
