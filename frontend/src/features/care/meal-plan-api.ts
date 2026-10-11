import { apiRequest } from "../../lib/http-client";
import type { Plan } from "../demo/types";
import type { Page } from "./api";

export type MealPlanRecord = Plan & {
  revision: number;
  effectiveEndOn: string | null;
  updatedAt: string;
  publishedAt: string | null;
  closedAt: string | null;
};

type ApiMealPlan = {
  id: string;
  patient_id: string;
  author_id: string;
  author_name: string;
  title: string;
  start_on: string;
  end_on: string;
  effective_end_on: string | null;
  water_liters: number;
  guidance: string;
  meals: Plan["meals"];
  status: Plan["status"];
  revision: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  closed_at: string | null;
};

function fromApi(row: ApiMealPlan): MealPlanRecord {
  return {
    id: row.id,
    patientId: row.patient_id,
    authorId: row.author_id,
    authorName: row.author_name,
    title: row.title,
    startDate: row.start_on,
    endDate: row.end_on,
    effectiveEndOn: row.effective_end_on,
    waterLiters: row.water_liters,
    guidance: row.guidance,
    meals: row.meals,
    status: row.status,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    closedAt: row.closed_at,
  };
}

function content(plan: Plan) {
  return {
    title: plan.title,
    start_on: plan.startDate,
    end_on: plan.endDate,
    water_liters: plan.waterLiters,
    guidance: plan.guidance,
    meals: plan.meals.map(meal => ({
      id: meal.id,
      title: meal.title,
      time: meal.time,
      foods: meal.foods,
      substitutions: meal.substitutions,
      calories: meal.calories,
      protein: meal.protein,
      carbs: meal.carbs,
      fats: meal.fats,
    })),
  };
}

export async function getCurrentPlan(token: string, patientId: string) {
  const row = await apiRequest<ApiMealPlan | null>(`/patients/${patientId}/plans/current`, { token });
  return row ? fromApi(row) : null;
}

export async function listPlanHistory(token: string, patientId: string, offset = 0) {
  const page = await apiRequest<Page<ApiMealPlan>>(`/patients/${patientId}/plans?offset=${offset}&limit=10`, { token });
  return { ...page, items: page.items.map(fromApi) };
}

export async function createMealPlan(token: string, patientId: string, plan: Plan) {
  const row = await apiRequest<ApiMealPlan>(`/patients/${patientId}/plans`, {
    method: "POST", token, body: JSON.stringify(content(plan)),
  });
  return fromApi(row);
}

export async function updateMealPlan(token: string, patientId: string, plan: Plan, revision: number) {
  const row = await apiRequest<ApiMealPlan>(`/patients/${patientId}/plans/${plan.id}`, {
    method: "PUT", token, body: JSON.stringify({ ...content(plan), expected_revision: revision }),
  });
  return fromApi(row);
}

export async function publishMealPlan(token: string, patientId: string, planId: string, revision: number) {
  const row = await apiRequest<ApiMealPlan>(`/patients/${patientId}/plans/${planId}/publish`, {
    method: "POST", token, body: JSON.stringify({ expected_revision: revision }),
  });
  return fromApi(row);
}

export async function closeMealPlan(token: string, patientId: string, planId: string, revision: number) {
  const row = await apiRequest<ApiMealPlan>(`/patients/${patientId}/plans/${planId}/close`, {
    method: "POST", token, body: JSON.stringify({ expected_revision: revision }),
  });
  return fromApi(row);
}
