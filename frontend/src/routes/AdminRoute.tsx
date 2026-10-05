import { Navigate, Outlet } from "react-router-dom";

import { useAuth } from "../features/auth/useAuth";

export function AdminRoute() {
  const { currentUser, isLoading } = useAuth();

  if (isLoading) return <main className="route-loading">Carregando...</main>;
  if (!currentUser) return <Navigate to="/login" replace />;
  if (currentUser.role !== "admin") {
    return <Navigate to={currentUser.role === "patient" ? "/app/paciente" : "/app/nutricionista"} replace />;
  }

  return <Outlet />;
}
