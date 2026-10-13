export type Food = { id: string; name: string; grams: number };
export type Meal = {
  done?: boolean;
  id: string;
  title: string;
  time: string;
  foods: Food[];
  substitutions: { id: string; foods: Food[] }[];
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
};
export type Plan = {
  id: string;
  patientId: string;
  authorId: string;
  authorName: string;
  title: string;
  startDate: string;
  endDate: string;
  waterLiters: number;
  guidance: string;
  meals: Meal[];
  status: "draft" | "published" | "closed";
  createdAt: string;
};
export type Measurement = {
  id: string;
  patientId: string;
  authorId: string;
  authorName: string;
  date: string;
  weight: number;
  bodyFat: number | null;
  note: string;
};
