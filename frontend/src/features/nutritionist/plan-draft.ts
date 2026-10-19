import type { Food, Meal, Plan } from "../care/types";
import { today } from "../../lib/formatters";

export const newFood = (): Food => ({
  id: crypto.randomUUID(),
  name: "",
  grams: 100,
});

export const newMeal = (): Meal => ({
  id: crypto.randomUUID(),
  title: "",
  time: "12:00",
  foods: [newFood()],
  substitutions: [],
  calories: 0,
  protein: 0,
  carbs: 0,
  fats: 0,
});

export function createPlanDraft(
  patientId: string,
  author: { id: string; name: string },
  source?: Plan,
): Plan {
  if (source) {
    return {
      ...structuredClone(source),
      id: source.status === "draft" ? source.id : crypto.randomUUID(),
      status: "draft",
      createdAt:
        source.status === "draft" ? source.createdAt : new Date().toISOString(),
      authorId: author.id,
      authorName: author.name,
    };
  }
  return {
    id: crypto.randomUUID(),
    patientId,
    authorId: author.id,
    authorName: author.name,
    title: "",
    startDate: today(),
    endDate: today(),
    waterLiters: 2,
    guidance: "",
    meals: [newMeal()],
    status: "draft",
    createdAt: new Date().toISOString(),
  };
}

export function updatePlanMeal(
  plan: Plan,
  id: string,
  change: Partial<Meal>,
): Plan {
  return {
    ...plan,
    meals: plan.meals.map((meal) =>
      meal.id === id ? { ...meal, ...change } : meal,
    ),
  };
}
