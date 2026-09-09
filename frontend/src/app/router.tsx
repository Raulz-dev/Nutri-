import { Navigate, Route, Routes } from "react-router-dom";

import { LoginPage } from "../features/auth/pages/LoginPage";
import { ForgotPasswordPage } from "../features/auth/pages/ForgotPasswordPage";
import { ProfilePage } from "../features/users/pages/ProfilePage";
import { ProtectedRoute } from "../routes/ProtectedRoute";

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/app/perfil" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
