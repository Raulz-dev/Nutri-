import { AuthContext } from "../../src/features/auth/AuthProvider";
import { ToastProvider } from "../../src/components/ui/ErrorToast";
import { SupportPanel } from "../../src/features/care/SupportPanel";

const user = {
  id: "synthetic-nutritionist",
  name: "Profissional de teste",
  email: "test@example.invalid",
  role: "nutritionist" as const,
  status: "active" as const,
};
export function SupportTestApp() {
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
        <SupportPanel />
      </ToastProvider>
    </AuthContext.Provider>
  );
}

