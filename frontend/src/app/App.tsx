import { BrowserRouter } from "react-router-dom";

import { AuthProvider } from "../features/auth/AuthProvider";
import { AppRouter } from "./router";
import { ToastProvider } from "../components/ui/ErrorToast";

export function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <AuthProvider>
          <AppRouter />
        </AuthProvider>
      </BrowserRouter>
    </ToastProvider>
  );
}
