import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthContext } from "../../src/features/auth/AuthProvider";
import { ToastProvider } from "../../src/components/ui/ErrorToast";
import { ClinicalPatientPage } from "../../src/features/nutritionist/pages/ClinicalPatientPage";
import { NutritionistLayout } from "../../src/features/nutritionist/layouts/NutritionistLayout";
import "../../src/styles/global.css";

const user = {
  id: "synthetic-nutritionist",
  name: "Profissional de teste",
  email: "test@example.invalid",
  role: "nutritionist" as const,
  status: "active" as const,
};
export function ClinicalTestApp() {
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
        <MemoryRouter
          initialEntries={["/app/nutricionista/pacientes/synthetic-patient"]}
        >
          <Routes>
            <Route path="/app/nutricionista" element={<NutritionistLayout />}>
              <Route
                path="pacientes/:patientId"
                element={<ClinicalPatientPage />}
              />
            </Route>
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </AuthContext.Provider>
  );
}

// Test-only API: every request is intercepted; no real patient data or server writes.
export function installClinicalFixture() {
  const original = globalThis.fetch;
  const requests: { path: string; method: string; body: any }[] = [];
  let measurements = Array.from({ length: 12 }, (_, index) => ({
    id: `measurement-${index}`,
    patient_id: "synthetic-patient",
    author_id: user.id,
    author_name: user.name,
    measured_on: `2026-10-${String(18 - index).padStart(2, "0")}`,
    weight_kg: 70 + index / 10,
    body_fat_pct: null,
    note: "Registro sintético",
    created_at: "2026-10-18T12:00:00Z",
  }));
  let followUps: {
    id: string;
    text: string;
    created_at: string;
    author_name: string;
  }[] = [];
  const plans: any[] = [];
  let goal = { target_kg: 68, revision: 2, author_name: user.name };
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    const path = url.pathname.replace("/api/v1", "");
    const method = options.method ?? "GET";
    const body = options.body ? JSON.parse(String(options.body)) : null;
    requests.push({ path, method, body });
    let result: unknown;
    if (path === "/patients/synthetic-patient")
      result = {
        id: "synthetic-patient",
        name: "Paciente sintético",
        email: "patient@example.invalid",
      };
    else if (path.endsWith("/intake")) result = { intake: null, revision: 0 };
    else if (path.endsWith("/weight-goal")) {
      if (method === "PUT")
        goal = {
          ...goal,
          target_kg: body.target_kg,
          revision: goal.revision + 1,
        };
      result = goal;
    } else if (/\/measurements\/[^/]+$/.test(path) && method === "PUT") {
      const id = path.split("/").at(-1)!;
      measurements = [
        { ...measurements[0], ...body, id },
        ...measurements.filter((row) => row.id !== id),
      ];
      result = measurements[0];
    } else if (/\/follow-ups\/[^/]+$/.test(path) && method === "PUT") {
      const id = path.split("/").at(-1)!;
      result = {
        id,
        text: body.text,
        created_at: "2026-10-19T12:00:00Z",
        author_name: user.name,
      };
      followUps = [
        result as (typeof followUps)[number],
        ...followUps.filter((row) => row.id !== id),
      ];
    } else if (path.endsWith("/measurements") || path.endsWith("/follow-ups")) {
      const rows = path.endsWith("/measurements") ? measurements : followUps;
      const offset = Number(url.searchParams.get("offset"));
      const limit = Number(url.searchParams.get("limit") ?? 10);
      result = {
        items: rows.slice(offset, offset + limit),
        total: rows.length,
        offset,
        limit,
      };
    } else if (path.endsWith("/plans")) {
      if (method === "POST") {
        result = {
          ...body,
          id: `synthetic-plan-${plans.length}`,
          patient_id: "synthetic-patient",
          author_id: user.id,
          author_name: user.name,
          status: "draft",
          revision: 1,
          created_at: "2026-10-19T12:00:00Z",
          effective_end_on: null,
        };
        plans.unshift(result);
      } else
        result = { items: plans, total: plans.length, offset: 0, limit: 10 };
    } else throw new Error(`Unexpected fixture request: ${method} ${path}`);
    return { ok: true, status: 200, json: async () => result } as Response;
  };
  return {
    requests,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}
