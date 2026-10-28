import { MemoryRouter, useLocation } from "react-router-dom";
import { AuthContext } from "../../src/features/auth/AuthProvider";
import { ToastProvider } from "../../src/components/ui/ErrorToast";
import { AdminSettingsPage } from "../../src/features/admin/pages/AdminSettingsPage";

const user = {
  id: "synthetic-admin",
  name: "Administrador sintético",
  email: "admin@example.invalid",
  role: "admin" as const,
  status: "active" as const,
};
function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}
export function AdminSettingsTestApp({
  onLogout,
  onReload,
}: {
  onLogout: () => Promise<void>;
  onReload: () => Promise<void>;
}) {
  return (
    <AuthContext.Provider
      value={{
        session: { accessToken: "synthetic-token" },
        currentUser: user,
        isAuthenticated: true,
        isLoading: false,
        login: async () => user,
        logout: onLogout,
        reloadUser: onReload,
      }}
    >
      <ToastProvider>
        <MemoryRouter initialEntries={["/app/admin/configuracoes"]}>
          <AdminSettingsPage />
          <Location />
        </MemoryRouter>
      </ToastProvider>
    </AuthContext.Provider>
  );
}
