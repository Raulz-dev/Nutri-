import type { Plan } from "./types";

export function validatePlan(plan: Plan) {
  if (!plan.title.trim() || !plan.startDate || !plan.endDate || plan.endDate < plan.startDate) {
    throw new Error("Informe título e período válido para o plano.");
  }
  if (!Number.isFinite(plan.waterLiters) || plan.waterLiters < 0 || plan.waterLiters > 15) {
    throw new Error("Informe uma meta de água entre 0 e 15 litros.");
  }
  if (!plan.meals.length) throw new Error("Adicione pelo menos uma refeição.");
  for (const meal of plan.meals) {
    if (!meal.title.trim() || !/^([01]\d|2[0-3]):[0-5]\d$/.test(meal.time)) {
      throw new Error("Informe nome e horário de cada refeição.");
    }
    for (const foods of [meal.foods, ...meal.substitutions.map(option => option.foods)]) {
      if (!foods.length || foods.some(food => !food.name.trim() || !Number.isFinite(food.grams) || food.grams <= 0)) {
        throw new Error("Cada refeição e substituição precisa de alimentos com nome e quantidade positiva em gramas.");
      }
    }
    if ([meal.calories, meal.protein, meal.carbs, meal.fats].some(value => !Number.isFinite(value) || value < 0)) {
      throw new Error("Os macronutrientes devem ser números positivos ou zero.");
    }
  }
}
