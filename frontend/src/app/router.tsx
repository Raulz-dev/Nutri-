import { Navigate, Route, Routes } from "react-router-dom";

import { LoginPage } from "../features/auth/pages/LoginPage";
import { ForgotPasswordPage } from "../features/auth/pages/ForgotPasswordPage";
import { ResetPasswordPage } from "../features/auth/pages/ResetPasswordPage";
import { RegisterPage } from "../features/auth/pages/RegisterPage";
import { PatientDashboardPage } from "../features/patient/pages/PatientDashboardPage";
import { ProfilePage } from "../features/users/pages/ProfilePage";
import { ProtectedRoute } from "../routes/ProtectedRoute";

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<PatientDashboardPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
      <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
      <Route path="/cadastro" element={<RegisterPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/app/paciente/:section?" element={<PatientDashboardPage />} />
        <Route path="/app/perfil" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
