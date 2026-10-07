import { BrowserRouter } from "react-router-dom";

import { AuthProvider } from "../features/auth/AuthProvider";
import { DemoRecoveryNotice } from "../features/demo/RecoveryNotice";
import { AppRouter } from "./router";
import { ToastProvider } from "../components/ui/ErrorToast";

export function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <AuthProvider>
          <DemoRecoveryNotice />
          <AppRouter />
        </AuthProvider>
      </BrowserRouter>
    </ToastProvider>
  );
}
