import { AuthContext } from "../../src/features/auth/AuthProvider";
import { ToastProvider } from "../../src/components/ui/ErrorToast";
import { PatientClinicalProvider } from "../../src/features/care/PatientClinicalContext";
import { PatientPreferencesSection } from "../../src/features/patient/sections/PatientPreferencesSection";

const user = {
  id: "synthetic-patient",
  name: "Paciente sintético",
  email: "test@example.invalid",
  role: "patient" as const,
  status: "active" as const,
};
export function IntakeTestApp() {
  return (
    <AuthContext.Provider
      value={{
        session: { accessToken: "synthetic-token" },
        currentUser: user,
        isAuthenticated: true,
        isLoading: false,
        login: async () => user,
        logout: async () => {},
        reloadUser: async () => {},
      }}
    >
      <ToastProvider>
        <PatientClinicalProvider token="synthetic-token" patientId={user.id}>
          <PatientPreferencesSection />
        </PatientClinicalProvider>
      </ToastProvider>
    </AuthContext.Provider>
  );
}
