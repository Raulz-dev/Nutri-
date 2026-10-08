import { apiRequest } from "../../lib/http-client";
import type { PatientIntake } from "../patient/patient-intake";
import type { Page } from "./api";

export type IntakeRecord = {
  intake: PatientIntake | null;
  revision: number;
  author_id: string | null;
  updated_at: string | null;
};

export type WeightGoalRecord = {
  target_kg: number | null;
  revision: number;
  author_id: string | null;
  author_name: string | null;
  updated_at: string | null;
};

export type ClinicalMeasurement = {
  id: string;
  patient_id: string;
  author_id: string;
  author_name: string;
  measured_on: string;
  weight_kg: number;
  body_fat_pct: number | null;
  note: string;
  created_at: string;
};

export type ClinicalFollowUp = {
  id: string;
  patient_id: string;
  author_id: string;
  author_name: string;
  text: string;
  created_at: string;
};

export const getIntake = (token: string, patientId: string) =>
  apiRequest<IntakeRecord>(`/patients/${patientId}/intake`, { token });

export const saveIntake = (token: string, patientId: string, intake: PatientIntake, revision: number) =>
  apiRequest<IntakeRecord>(`/patients/${patientId}/intake`, {
    method: "PUT", token, body: JSON.stringify({ intake, expected_revision: revision }),
  });

export const getWeightGoal = (token: string, patientId: string) =>
  apiRequest<WeightGoalRecord>(`/patients/${patientId}/weight-goal`, { token });

export const saveWeightGoal = (token: string, patientId: string, targetKg: number, revision: number) =>
  apiRequest<WeightGoalRecord>(`/patients/${patientId}/weight-goal`, {
    method: "PUT", token, body: JSON.stringify({ target_kg: targetKg, expected_revision: revision }),
  });

export const listMeasurements = (token: string, patientId: string, offset = 0, limit = 10) =>
  apiRequest<Page<ClinicalMeasurement>>(`/patients/${patientId}/measurements?offset=${offset}&limit=${limit}`, { token });

export async function measurementOverview(token: string, patientId: string) {
  const recent = await listMeasurements(token, patientId, 0, 8);
  const oldest = recent.total > recent.items.length
    ? (await listMeasurements(token, patientId, recent.total - 1, 1)).items[0] ?? null
    : recent.items.at(-1) ?? null;
  return { recent: recent.items, oldest, total: recent.total };
}

export const addMeasurement = (token: string, patientId: string, data: {
  measured_on: string; weight_kg: number; body_fat_pct: number | null; note: string;
}) => apiRequest<ClinicalMeasurement>(`/patients/${patientId}/measurements`, {
  method: "POST", token, body: JSON.stringify(data),
});

export const listFollowUps = (token: string, patientId: string, offset = 0, limit = 10) =>
  apiRequest<Page<ClinicalFollowUp>>(`/patients/${patientId}/follow-ups?offset=${offset}&limit=${limit}`, { token });

export const addFollowUp = (token: string, patientId: string, text: string) =>
  apiRequest<ClinicalFollowUp>(`/patients/${patientId}/follow-ups`, {
    method: "POST", token, body: JSON.stringify({ text }),
  });
