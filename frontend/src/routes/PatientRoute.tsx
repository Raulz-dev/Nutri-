import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../features/auth/useAuth";

export function PatientRoute() {
  const { currentUser, isLoading } = useAuth();
  if (isLoading) return <main className="route-loading">Carregando...</main>;
  if (!currentUser) return <Navigate to="/login" replace />;
  if (currentUser.role !== "patient")
    return (
      <Navigate
        to={currentUser.role === "admin" ? "/app/admin" : "/app/nutricionista"}
        replace
      />
    );
  return <Outlet />;
}
