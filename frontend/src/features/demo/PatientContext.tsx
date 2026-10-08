import { createContext, useContext } from "react";
import { useAuth } from "../auth/useAuth";
import {
  activePlan,
  dateLabel,
  demoUsers,
  nextAppointment,
  useDemo,
} from "./store";
import { usePatientClinical } from "../care/PatientClinicalContext";
export const PatientContext = createContext<string | null>(null);
export function usePatientData() {
  const previewId = useContext(PatientContext);
  const { currentUser } = useAuth();
  const clinical = usePatientClinical();
  const state = useDemo();
  const patientId = previewId ?? currentUser!.id;
  const patient = clinical.patient ?? currentUser!;
  const owner = clinical.patient?.nutritionist_id ?? undefined;
  const nutritionist = clinical.patient?.nutritionist_name ?? "Sem nutricionista";
  const plan = activePlan(state, patientId);
  const appointment = nextAppointment(state, patientId);
  const history = clinical.measurements;
  const latest = history.at(-1);
  const first = clinical.firstMeasurement;
  const fmt = (n: number) => n.toLocaleString("pt-BR");
  const meals = [...(plan?.meals ?? [])]
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((m) => ({
      ...m,
      done: m.done ?? false,
      foods: m.foods.map((f) => `${f.name} — ${fmt(f.grams)} g`),
      substitutions: m.substitutions.map((s) => ({
        id: s.id,
        foods: s.foods.map((f) => `${f.name} — ${fmt(f.grams)} g`),
      })),
      macros: {
        calories: `${m.calories} kcal`,
        protein: `${m.protein} g`,
        carbs: `${m.carbs} g`,
        fats: `${m.fats} g`,
      },
    }));
  const view = {
    name: patient.name.split(" ")[0],
    fullName: patient.name,
    email: patient.email,
    nutritionist,
    currentWeight: latest ? `${fmt(latest.weight)} kg` : "Sem registro",
    weightChange:
      latest && first && clinical.measurementTotal > 1
        ? `${fmt(latest.weight - first.weight)} kg desde o início`
        : "Sem variação registrada",
    bodyFat:
      latest?.bodyFat != null ? `${fmt(latest.bodyFat)}%` : "Sem registro",
    bodyFatChange:
      latest?.bodyFat != null &&
      first?.bodyFat != null &&
      clinical.measurementTotal > 1
        ? `${fmt(latest.bodyFat - first.bodyFat)} pontos percentuais desde o início`
        : "Última medição",
    dailyCalories: plan
      ? `${fmt(plan.meals.reduce((n, m) => n + m.calories, 0))} kcal`
      : "Sem plano",
    measurements: history
      .slice(-4)
      .map((m) => ({ ...m, date: dateLabel(m.date) })),
    mealPlan: {
      title: plan?.title ?? "Nenhum plano ativo",
      guidance: plan?.guidance ?? "",
      startDate: plan ? dateLabel(plan.startDate) : "—",
      validUntil: plan ? dateLabel(plan.endDate) : "—",
      dailyWaterGoal: plan ? `${fmt(plan.waterLiters)} L` : "—",
    },
    meals,
    appointment: appointment
      ? {
          date: dateLabel(appointment.date),
          time: appointment.time,
          type: "Consulta de acompanhamento",
          format: appointment.format,
          location: appointment.location,
          address: "",
          guidance: appointment.guidance,
        }
      : null,
  };
  return {
    state,
    patientId,
    patient,
    nutritionist,
    owner,
    plan,
    history,
    view,
  };
}
