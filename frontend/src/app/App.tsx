import { createBrowserRouter, RouterProvider } from "react-router-dom";

import { AuthProvider } from "../features/auth/AuthProvider";
import { AppRouter } from "./router";
import { ToastProvider } from "../components/ui/ErrorToast";
import { AutoSaveNavigation } from "../hooks/AutoSaveNavigation";

const router = createBrowserRouter([
  {
    path: "*",
    element: (
      <AuthProvider>
        <AutoSaveNavigation>
          <AppRouter />
        </AutoSaveNavigation>
      </AuthProvider>
    ),
  },
]);

export function App() {
  return (
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>
  );
}
