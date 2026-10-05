import type { User } from "../users/types";
import type { PatientIntake } from "../patient/patient-intake";
export type Link = {
  patientId: string;
  nutritionistId: string;
  linkedAt: string;
  conversationId?: string;
};
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
export type FollowUp = {
  id: string;
  patientId: string;
  authorId: string;
  authorName: string;
  date: string;
  text: string;
};
export type Appointment = {
  id: string;
  patientId: string;
  authorId: string;
  authorName: string;
  date: string;
  time: string;
  format: "Presencial" | "Online";
  location: string;
  guidance: string;
  status: "scheduled" | "completed" | "cancelled";
};
export type Message = {
  id: string;
  sender: "patient" | "nutritionist";
  text: string;
  sentAt: string;
  read: boolean;
};
export type Conversation = {
  id: string;
  patientId: string;
  nutritionistId: string;
  messages: Message[];
};
export type ProfessionalProfile = {
  name: string;
  crn: string;
  contact: string;
  bio: string;
};
export type DemoState = {
  version: 1;
  actors: User[];
  links: Link[];
  plans: Plan[];
  measurements: Measurement[];
  followUps: FollowUp[];
  appointments: Appointment[];
  conversations: Conversation[];
  intakes: Record<string, PatientIntake>;
  profiles: Record<string, ProfessionalProfile>;
  weightGoals?: Record<string, number>;
};
