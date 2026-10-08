import { NutritionistRoute } from "../routes/NutritionistRoute";
import { NutritionistLayout } from "../features/nutritionist/layouts/NutritionistLayout";
import { NutritionistDashboardPage } from "../features/nutritionist/pages/DashboardPage";
import { NutritionistPatientsPage } from "../features/nutritionist/pages/PatientsPage";
import { ReadOnlyPatientPreview } from "../features/nutritionist/pages/ReadOnlyPatientPreview";
import { ClinicalPatientPage } from "../features/nutritionist/pages/ClinicalPatientPage";
import { NutritionistAppointmentsPage } from "../features/nutritionist/pages/AppointmentsPage";
import { NutritionistMessagesPage } from "../features/nutritionist/pages/MessagesPage";
import { NutritionistProfilePage } from "../features/nutritionist/pages/ProfilePage";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { AdminDashboardPage } from "../features/admin/pages/AdminDashboardPage";
import { AdminChatPage } from "../features/admin/pages/AdminChatPage";
import { AdminPatientsPage } from "../features/admin/pages/AdminPatientsPage";
import { AdminNutritionistsPage } from "../features/admin/pages/AdminNutritionistsPage";
import { AdminAuditPage } from "../features/admin/pages/AdminAuditPage";
import { AdminSettingsPage } from "../features/admin/pages/AdminSettingsPage";
import { LoginPage } from "../features/auth/pages/LoginPage";
import { ForgotPasswordPage } from "../features/auth/pages/ForgotPasswordPage";
import { ResetPasswordPage } from "../features/auth/pages/ResetPasswordPage";
import { FirstAccessPage } from "../features/auth/pages/FirstAccessPage";
import { RegisterPage } from "../features/auth/pages/RegisterPage";
import { PatientDashboardPage } from "../features/patient/pages/PatientDashboardPage";
import { ProfilePage } from "../features/users/pages/ProfilePage";
import { ProtectedRoute } from "../routes/ProtectedRoute";
import { AdminRoute } from "../routes/AdminRoute";
import { PatientRoute } from "../routes/PatientRoute";

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
      <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
      <Route path="/primeiro-acesso" element={<FirstAccessPage />} />
      <Route path="/cadastro" element={<RegisterPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<PatientRoute />}>
          <Route path="/app/paciente/:section?" element={<PatientDashboardPage />} />
        </Route>
        <Route element={<NutritionistRoute />}>
          <Route path="/app/nutricionista/pacientes/:patientId/previa/:section?" element={<ReadOnlyPatientPreview />} />
          <Route path="/app/nutricionista" element={<NutritionistLayout />}>
            <Route index element={<NutritionistDashboardPage />} />
            <Route path="pacientes" element={<NutritionistPatientsPage />} />
            <Route path="pacientes/:patientId" element={<ClinicalPatientPage />} />
            <Route path="consultas" element={<NutritionistAppointmentsPage />} />
            <Route path="mensagens" element={<NutritionistMessagesPage />} />
            <Route path="perfil" element={<NutritionistProfilePage />} />
          </Route>
        </Route>
        <Route path="/app/perfil" element={<ProfilePage />} />
        <Route element={<AdminRoute />}>
          <Route path="/app/admin" element={<AdminDashboardPage />} />
          <Route path="/app/admin/pacientes" element={<AdminPatientsPage />} />
          <Route path="/app/admin/nutricionistas" element={<AdminNutritionistsPage />} />
          <Route path="/app/admin/usuarios" element={<LegacyPatientsRedirect />} />
          <Route path="/app/admin/vinculos" element={<LegacyPatientsRedirect />} />
          <Route path="/app/admin/chat" element={<AdminChatPage />} />
          <Route path="/app/admin/auditoria" element={<AdminAuditPage />} />
          <Route path="/app/admin/configuracoes" element={<AdminSettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

function LegacyPatientsRedirect() {
  const location = useLocation();
  return <Navigate to={{ pathname: "/app/admin/pacientes", search: location.search }} replace />;
}
