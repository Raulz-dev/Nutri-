import { recordAudit } from "./admin-audit";
import { readDemo, transferPatient } from "../demo/store";
import type { Link } from "../demo/types";
import type { User } from "../users/types";
export type PatientNutritionistLink = Link;
export function readPatientLinks() { return readDemo().links; }
export function savePatientLink(_links: Link[], patient: User, nutritionist: User) {
  const state = transferPatient(patient.id, nutritionist.id);
  recordAudit("link", patient.name, `Vinculado à nutricionista ${nutritionist.name}`);
  return state.links;
}
export function removePatientLink(_links: Link[], patient: User) {
  const state = transferPatient(patient.id, null);
  recordAudit("unlink", patient.name, "Vínculo com nutricionista removido");
  return state.links;
}
