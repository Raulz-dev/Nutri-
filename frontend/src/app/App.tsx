import { BrowserRouter } from "react-router-dom";

import { AuthProvider } from "../features/auth/AuthProvider";
import { DemoRecoveryNotice } from "../features/demo/RecoveryNotice";
import { AppRouter } from "./router";

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <DemoRecoveryNotice />
        <AppRouter />
      </AuthProvider>
    </BrowserRouter>
  );
}
