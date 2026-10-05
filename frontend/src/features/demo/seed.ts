import { patientMock } from "../patient/mocks/patient-data";
import { readPatientIntake } from "../patient/patient-intake";
import type { DemoState, Food, Link } from "./types";

export const initialWeightGoals = {
  "demo-03": Number.parseFloat(patientMock.goal),
};

function food(value: string, index: number): Food {
  const [name, amount] = value.split(" — ");
  return { id: `food-${index}`, name, grams: Number.parseFloat(amount) || 1 };
}
export function seedDemo(): DemoState {
  const date = "2026-09-24T10:00:00.000Z";
  let links: Link[] = [
    { patientId: "demo-03", nutritionistId: "demo-01", linkedAt: date },
    { patientId: "demo-04", nutritionistId: "demo-02", linkedAt: date },
    { patientId: "demo-07", nutritionistId: "demo-06", linkedAt: date },
  ];
  try {
    const stored = JSON.parse(
      localStorage.getItem("mais-saude-admin-links-v1") ?? "null",
    );
    if (Array.isArray(stored)) links = stored;
  } catch {
    /* Preserve defaults for an invalid legacy value. */
  }
  links = links.map((link) => ({
    ...link,
    conversationId: `initial-${link.patientId}-${link.nutritionistId}`,
  }));
  return {
    version: 1,
    weightGoals: initialWeightGoals,
    actors: [],
    links,
    profiles: {},
    followUps: [],
    intakes: { "demo-03": readPatientIntake() },
    plans: [
      {
        id: "camila-plan",
        patientId: "demo-03",
        authorId: "demo-01",
        authorName: "Marina Costa",
        title: patientMock.mealPlan.title,
        startDate: "2026-09-24",
        endDate: "2026-10-24",
        waterLiters: 2.2,
        guidance: patientMock.guidance,
        status: "published",
        createdAt: date,
        meals: patientMock.meals.map((meal, i) => ({
          id: `meal-${i}`,
          title: meal.title,
          done: meal.done,
          time: meal.time,
          foods: meal.foods.map(food),
          substitutions: meal.substitutions.map((s) => ({
            id: s.id,
            foods: s.foods.map(food),
          })),
          calories: parseFloat(meal.macros.calories),
          protein: parseFloat(meal.macros.protein),
          carbs: parseFloat(meal.macros.carbs),
          fats: parseFloat(meal.macros.fats),
        })),
      },
    ],
    measurements: patientMock.measurementHistory.map((m, i) => ({
      id: `measurement-${i}`,
      patientId: "demo-03",
      authorId: "demo-01",
      authorName: "Marina Costa",
      date: `2026-${m.date.includes("ago") ? "08" : "09"}-${m.date.slice(0, 2)}`,
      weight: m.weight,
      bodyFat: m.bodyFat,
      note: "",
    })),
    appointments: [
      {
        id: "camila-appointment",
        patientId: "demo-03",
        authorId: "demo-01",
        authorName: "Marina Costa",
        date: "2026-09-28",
        time: "14:30",
        format: "Presencial",
        location: `${patientMock.appointment.location} · ${patientMock.appointment.address}`,
        guidance: patientMock.appointment.guidance,
        status: "scheduled",
      },
    ],
    conversations: links.map((link) => ({
      id: link.conversationId!,
      patientId: link.patientId,
      nutritionistId: link.nutritionistId,
      messages:
        link.patientId === "demo-03" && link.nutritionistId === "demo-01"
          ? [
              {
                id: "welcome-camila",
                sender: "nutritionist",
                text: "Olá, Camila! Como você se sentiu com o novo plano alimentar?",
                sentAt: date,
                read: true,
              },
              {
                id: "camila-reply",
                sender: "patient",
                text: "Oi, doutora! Estou me adaptando bem. Senti um pouco de fome no fim da tarde.",
                sentAt: "2026-09-24T12:36:00.000Z",
                read: true,
              },
              {
                id: "marina-guidance",
                sender: "nutritionist",
                text: "Obrigada por me contar. Tente manter o lanche da tarde no horário e observe como se sente nos próximos dias.",
                sentAt: "2026-09-24T12:40:00.000Z",
                read: true,
              },
              {
                id: "marina-progress",
                sender: "nutritionist",
                text: "Sua evolução desta semana foi muito boa. Continue registrando as refeições e a ingestão de água.",
                sentAt: "2026-09-24T12:42:00.000Z",
                read: false,
              },
            ]
          : [],
    })),
  };
}
