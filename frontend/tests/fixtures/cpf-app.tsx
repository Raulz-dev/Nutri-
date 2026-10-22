import { useState } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthContext } from "../../src/features/auth/AuthProvider";
import { ToastProvider } from "../../src/components/ui/ErrorToast";
import { RegisterPage } from "../../src/features/auth/pages/RegisterPage";
import { FirstAccessPage } from "../../src/features/auth/pages/FirstAccessPage";
import { AccountCpf } from "../../src/features/users/AccountCpf";

export function CpfTestApp({
  mode,
}: {
  mode: "register" | "first-access" | "legacy";
}) {
  const [cpf, setCpf] = useState<string | null>(null);
  const user = {
    id: "synthetic-user",
    name: "Pessoa Sintética",
    email: "synthetic@example.com",
    role: "patient" as const,
    status: "active" as const,
    cpf,
  };
  return (
    <AuthContext.Provider
      value={{
        session: { accessToken: "synthetic-token" },
        currentUser: user,
        isAuthenticated: true,
        isLoading: false,
        login: async () => user,
        logout: async () => {},
        reloadUser: async () => {
          setCpf("11144477735");
        },
      }}
    >
      <ToastProvider>
        <MemoryRouter
          initialEntries={[
            mode === "first-access"
              ? "/primeiro-acesso?token=synthetic-invite"
              : "/",
          ]}
        >
          <Routes>
            <Route
              path="/"
              element={mode === "legacy" ? <AccountCpf /> : <RegisterPage />}
            />
            <Route path="/primeiro-acesso" element={<FirstAccessPage />} />
            <Route path="/login" element={<p>Cadastro concluído</p>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </AuthContext.Provider>
  );
}
