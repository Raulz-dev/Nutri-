import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../features/auth/useAuth";
export function NutritionistRoute() {
  const { currentUser, isLoading } = useAuth();
  if (isLoading) return <main className="route-loading">Carregando...</main>;
  if (!currentUser) return <Navigate to="/login" replace />;
  if (currentUser.role !== "nutritionist")
    return (
      <Navigate
        to={currentUser.role === "admin" ? "/app/admin" : "/app/paciente"}
        replace
      />
    );
  return <Outlet />;
}
