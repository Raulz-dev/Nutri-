import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { MessagingChannels } from "../../src/features/nutritionist/components/MessagingChannels";
import { AuthContext } from "../../src/features/auth/AuthProvider";
import { ToastProvider } from "../../src/components/ui/ErrorToast";
import { WhatsAppPanel } from "../../src/features/nutritionist/components/WhatsAppPanel";

const user = {
  id: "synthetic-nutritionist",
  name: "Profissional de teste",
  email: "test@example.invalid",
  role: "nutritionist" as const,
  status: "active" as const,
};
function AuthenticatedTestApp({ children }: { children: ReactNode }) {
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
      <ToastProvider>{children}</ToastProvider>
    </AuthContext.Provider>
  );
}

export function WhatsAppTestApp() {
  return (
    <AuthenticatedTestApp>
      <WhatsAppPanel />
    </AuthenticatedTestApp>
  );
}

export function MessagingChannelsTestApp({ search = "" }: { search?: string }) {
  return (
    <AuthenticatedTestApp>
      <MemoryRouter initialEntries={[`/app/nutricionista/mensagens${search}`]}>
        <Routes>
          <Route
            path="/app/nutricionista/mensagens"
            element={<MessagingChannels />}
          />
        </Routes>
      </MemoryRouter>
    </AuthenticatedTestApp>
  );
}
